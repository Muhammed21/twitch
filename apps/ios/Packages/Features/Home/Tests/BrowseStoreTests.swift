import Domain
import Foundation
import Home
import Testing

private struct CategoriesDown: Error {}

private func category(_ slug: String, viewers: Int? = nil) throws -> BrowseCategory {
  try BrowseCategory(
    slug: CategorySlug(slug),
    name: slug.capitalized,
    imageURL: nil,
    liveCount: 1,
    viewers: viewers.map { try ViewerCount($0) }
  )
}

private func page(_ slugs: [String], next: String? = nil) throws -> CategoryPage {
  try CategoryPage(categories: slugs.map { try category($0) }, nextCursor: next.map(CategoryCursor.init))
}

private actor FakeCategories: CategoryDirectory {
  private(set) var requested: [CategoryCursor?] = []
  private var pages: [CategoryCursor?: Result<CategoryPage, CategoriesDown>]

  init(pages: [CategoryCursor?: Result<CategoryPage, CategoriesDown>]) {
    self.pages = pages
  }

  func categories(after cursor: CategoryCursor?) async throws -> CategoryPage {
    requested.append(cursor)
    guard let page = pages[cursor] else { throw CategoriesDown() }
    return try page.get()
  }

  func serve(_ cursor: CategoryCursor?, with page: Result<CategoryPage, CategoriesDown>) {
    pages[cursor] = page
  }
}

@MainActor
@Suite("Browse : catégories en live paginées par curseur (parcourir/liste-categories--defaut)")
struct BrowseStoreTests {
  @Test("au départ, rien n'est chargé")
  func idle() {
    let store = BrowseStore(directory: FakeCategories(pages: [:]))

    #expect(store.categories.isEmpty)
    #expect(store.phase == .idle)
  }

  @Test("la première page charge les catégories sans curseur, dans l'ordre de l'API")
  func firstPage() async throws {
    let first = try [category("just-chatting", viewers: 184_000), category("fortnite")]
    let directory = try FakeCategories(pages: [nil: .success(CategoryPage(categories: first, nextCursor: CategoryCursor("c2")))])
    let store = BrowseStore(directory: directory)

    await store.loadFirstPage()

    #expect(store.categories == first)
    #expect(store.phase == .loaded(hasMore: true))
    #expect(await directory.requested == [nil])
  }

  @Test("la page suivante part du curseur reçu et s'ajoute sans doublon, même si l'ordre a bougé entre deux pages")
  func nextPageWithoutDuplicates() async throws {
    let directory = try FakeCategories(pages: [
      nil: .success(page(["just-chatting", "fortnite"], next: "c2")),
      CategoryCursor("c2"): .success(page(["fortnite", "irl"])),
    ])
    let store = BrowseStore(directory: directory)

    await store.loadFirstPage()
    await store.loadNextPage()

    #expect(store.categories.map(\.slug.rawValue) == ["just-chatting", "fortnite", "irl"])
    #expect(store.phase == .loaded(hasMore: false))
    #expect(await directory.requested == [nil, CategoryCursor("c2")])
  }

  @Test("sans curseur suivant, aucune page n'est plus demandée")
  func stopsAtLastPage() async throws {
    let directory = try FakeCategories(pages: [nil: .success(page(["irl"]))])
    let store = BrowseStore(directory: directory)

    await store.loadFirstPage()
    await store.loadNextPage()

    #expect(await directory.requested == [nil])
  }

  @Test("deux demandes de page suivante simultanées ne font qu'un appel")
  func singleRequestInFlight() async throws {
    let directory = try FakeCategories(pages: [nil: .success(page(["irl"], next: "c2"))])
    let store = BrowseStore(directory: directory)
    await store.loadFirstPage()
    try await directory.serve(CategoryCursor("c2"), with: .success(page(["fortnite"])))

    async let first: Void = store.loadNextPage()
    async let second: Void = store.loadNextPage()
    _ = await (first, second)

    #expect(await directory.requested == [nil, CategoryCursor("c2")])
    #expect(store.categories.map(\.slug.rawValue) == ["irl", "fortnite"])
  }

  @Test("un échec garde les catégories déjà chargées ; réessayer redemande la même page")
  func failureKeepsCategories() async throws {
    let directory = try FakeCategories(pages: [nil: .success(page(["irl"], next: "c2"))])
    let store = BrowseStore(directory: directory)
    await store.loadFirstPage()

    await store.loadNextPage()

    #expect(store.phase == .failed)
    #expect(store.categories.map(\.slug.rawValue) == ["irl"])

    try await directory.serve(CategoryCursor("c2"), with: .success(page(["fortnite"])))
    await store.retry()

    #expect(store.categories.map(\.slug.rawValue) == ["irl", "fortnite"])
    #expect(await directory.requested == [nil, CategoryCursor("c2"), CategoryCursor("c2")])
  }

  @Test("réessayer après l'échec de la première page la redemande")
  func retryFirstPage() async throws {
    let directory = FakeCategories(pages: [:])
    let store = BrowseStore(directory: directory)
    await store.loadFirstPage()

    #expect(store.phase == .failed)

    try await directory.serve(nil, with: .success(page(["irl"])))
    await store.retry()

    #expect(store.categories.map(\.slug.rawValue) == ["irl"])
    #expect(await directory.requested == [nil, nil])
  }

  @Test("un nouvel essai réussi efface l'échec : réessayer encore ne redemande rien")
  func retryOnlyOnce() async throws {
    let directory = FakeCategories(pages: [:])
    let store = BrowseStore(directory: directory)
    await store.loadFirstPage()
    try await directory.serve(nil, with: .success(page(["irl"])))
    await store.retry()

    await store.retry()

    #expect(await directory.requested == [nil, nil])
  }

  @Test("recharger repart de la première page et remplace la liste")
  func reload() async throws {
    let directory = try FakeCategories(pages: [
      nil: .success(page(["irl"], next: "c2")),
      CategoryCursor("c2"): .success(page(["fortnite"])),
    ])
    let store = BrowseStore(directory: directory)
    await store.loadFirstPage()
    await store.loadNextPage()
    try await directory.serve(nil, with: .success(page(["minecraft"])))

    await store.loadFirstPage()

    #expect(store.categories.map(\.slug.rawValue) == ["minecraft"])
    #expect(store.phase == .loaded(hasMore: false))
  }

  @Test("loadIfNeeded ne recharge pas une liste déjà demandée")
  func loadIfNeeded() async throws {
    let directory = try FakeCategories(pages: [nil: .success(page(["irl"]))])
    let store = BrowseStore(directory: directory)

    await store.loadIfNeeded()
    await store.loadIfNeeded()

    #expect(await directory.requested == [nil])
  }
}
