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

private actor FakeCategories: CategoryDirectory {
  private(set) var requests = 0
  private var answers: [Result<[BrowseCategory], CategoriesDown>]

  init(_ answers: [Result<[BrowseCategory], CategoriesDown>]) {
    self.answers = answers
  }

  func categories() async throws -> [BrowseCategory] {
    requests += 1
    guard !answers.isEmpty else { throw CategoriesDown() }
    return try answers.removeFirst().get()
  }
}

@MainActor
@Suite("Browse : catégories en live (parcourir/liste-categories--defaut)")
struct BrowseStoreTests {
  @Test("au départ, rien n'est chargé")
  func idle() {
    let store = BrowseStore(directory: FakeCategories([]))

    #expect(store.categories.isEmpty)
    #expect(store.phase == .idle)
  }

  @Test("charge les catégories dans l'ordre de l'API")
  func load() async throws {
    let categories = try [category("just-chatting", viewers: 184_000), category("fortnite")]
    let store = BrowseStore(directory: FakeCategories([.success(categories)]))

    await store.load()

    #expect(store.categories == categories)
    #expect(store.phase == .loaded)
  }

  @Test("un échec garde les catégories déjà affichées et passe en erreur")
  func failureKeepsCategories() async throws {
    let categories = try [category("irl")]
    let store = BrowseStore(directory: FakeCategories([.success(categories), .failure(CategoriesDown())]))

    await store.load()
    await store.load()

    #expect(store.categories == categories)
    #expect(store.phase == .failed)
  }

  @Test("un rechargement remplace la liste par la réponse de l'API")
  func reloadReplaces() async throws {
    let store = try BrowseStore(directory: FakeCategories([
      .success([category("irl"), category("fortnite")]),
      .success([category("fortnite")]),
    ]))

    await store.load()
    await store.load()

    #expect(try store.categories == [category("fortnite")])
    #expect(store.phase == .loaded)
  }

  @Test("loadIfNeeded ne recharge pas une liste déjà demandée")
  func loadIfNeeded() async throws {
    let directory = try FakeCategories([.success([category("irl")])])
    let store = BrowseStore(directory: directory)

    await store.loadIfNeeded()
    await store.loadIfNeeded()

    #expect(await directory.requests == 1)
  }
}
