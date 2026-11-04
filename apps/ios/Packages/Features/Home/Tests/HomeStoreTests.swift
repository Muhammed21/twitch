import Domain
import Foundation
import Home
import Testing

private struct DirectoryDown: Error {}

private func live(_ slug: String, id: Int) throws -> LiveChannel {
  let channelID = try ChannelID(#require(UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", id))))
  return try LiveChannel(
    session: StreamSession(channelID: channelID, startedAt: Date(timeIntervalSince1970: TimeInterval(id))),
    slug: ChannelSlug(slug),
    title: "Live \(slug)",
    viewers: nil
  )
}

private actor FakeDirectory: LiveDirectory {
  private(set) var requested: [LiveCursor?] = []
  private var pages: [LiveCursor?: Result<LivePage, DirectoryDown>]

  init(pages: [LiveCursor?: Result<LivePage, DirectoryDown>]) {
    self.pages = pages
  }

  func lives(after cursor: LiveCursor?) async throws -> LivePage {
    requested.append(cursor)
    guard let page = pages[cursor] else { throw DirectoryDown() }
    return try page.get()
  }

  func serve(_ cursor: LiveCursor?, with page: Result<LivePage, DirectoryDown>) {
    pages[cursor] = page
  }
}

@MainActor
@Suite("Accueil : lives en cours paginés par curseur")
struct HomeStoreTests {
  @Test("la première page charge les lives sans curseur")
  func firstPage() async throws {
    let first = try [live("jean_dupont", id: 1), live("marie_curie", id: 2)]
    let directory = FakeDirectory(pages: [nil: .success(LivePage(lives: first, nextCursor: LiveCursor("c2")))])
    let store = HomeStore(directory: directory)

    await store.loadFirstPage()

    #expect(store.lives == first)
    #expect(store.phase == .loaded(hasMore: true))
    #expect(await directory.requested == [nil])
  }

  @Test("la page suivante part du curseur reçu et s'ajoute sans doublon")
  func nextPageWithoutDuplicates() async throws {
    let directory = try FakeDirectory(pages: [
      nil: .success(LivePage(lives: [live("jean_dupont", id: 1), live("marie_curie", id: 2)], nextCursor: LiveCursor("c2"))),
      LiveCursor("c2"): .success(LivePage(lives: [live("marie_curie", id: 2), live("ada_lovelace", id: 3)], nextCursor: nil)),
    ])
    let store = HomeStore(directory: directory)

    await store.loadFirstPage()
    await store.loadNextPage()

    #expect(store.lives.map(\.slug.rawValue) == ["jean_dupont", "marie_curie", "ada_lovelace"])
    #expect(store.phase == .loaded(hasMore: false))
    #expect(await directory.requested == [nil, LiveCursor("c2")])
  }

  @Test("sans curseur suivant, aucune page n'est plus demandée")
  func stopsAtLastPage() async throws {
    let directory = try FakeDirectory(pages: [nil: .success(LivePage(lives: [live("jean_dupont", id: 1)], nextCursor: nil))])
    let store = HomeStore(directory: directory)

    await store.loadFirstPage()
    await store.loadNextPage()

    #expect(await directory.requested == [nil])
  }

  @Test("deux demandes de page suivante simultanées ne font qu'un appel")
  func singleRequestInFlight() async throws {
    let directory = try FakeDirectory(pages: [
      nil: .success(LivePage(lives: [live("jean_dupont", id: 1)], nextCursor: LiveCursor("c2"))),
    ])
    let store = HomeStore(directory: directory)
    await store.loadFirstPage()
    try await directory.serve(LiveCursor("c2"), with: .success(LivePage(lives: [live("ada_lovelace", id: 3)], nextCursor: nil)))

    async let first: Void = store.loadNextPage()
    async let second: Void = store.loadNextPage()
    _ = await (first, second)

    #expect(await directory.requested == [nil, LiveCursor("c2")])
    #expect(store.lives.map(\.slug.rawValue) == ["jean_dupont", "ada_lovelace"])
  }

  @Test("un échec garde les lives déjà chargés et permet de réessayer la même page")
  func failureKeepsLives() async throws {
    let directory = try FakeDirectory(pages: [
      nil: .success(LivePage(lives: [live("jean_dupont", id: 1)], nextCursor: LiveCursor("c2"))),
      LiveCursor("c2"): .failure(DirectoryDown()),
    ])
    let store = HomeStore(directory: directory)
    await store.loadFirstPage()

    await store.loadNextPage()

    #expect(store.phase == .failed)
    #expect(store.lives.map(\.slug.rawValue) == ["jean_dupont"])

    try await directory.serve(LiveCursor("c2"), with: .success(LivePage(lives: [live("ada_lovelace", id: 3)], nextCursor: nil)))
    await store.loadNextPage()

    #expect(store.lives.map(\.slug.rawValue) == ["jean_dupont", "ada_lovelace"])
    #expect(await directory.requested == [nil, LiveCursor("c2"), LiveCursor("c2")])
  }

  @Test("un échec de la première page laisse l'accueil vide en erreur")
  func firstPageFailure() async {
    let store = HomeStore(directory: FakeDirectory(pages: [:]))

    await store.loadFirstPage()

    #expect(store.lives.isEmpty)
    #expect(store.phase == .failed)
  }

  @Test("réessayer après l'échec de la première page la redemande")
  func retryFirstPage() async throws {
    let directory = FakeDirectory(pages: [:])
    let store = HomeStore(directory: directory)
    await store.loadFirstPage()
    try await directory.serve(nil, with: .success(LivePage(lives: [live("jean_dupont", id: 1)], nextCursor: nil)))

    await store.retry()

    #expect(store.lives.map(\.slug.rawValue) == ["jean_dupont"])
    #expect(await directory.requested == [nil, nil])
  }

  @Test("réessayer après l'échec d'une page suivante redemande cette page, sans perdre les autres")
  func retryNextPage() async throws {
    let directory = try FakeDirectory(pages: [
      nil: .success(LivePage(lives: [live("jean_dupont", id: 1)], nextCursor: LiveCursor("c2"))),
    ])
    let store = HomeStore(directory: directory)
    await store.loadFirstPage()
    await store.loadNextPage()
    try await directory.serve(LiveCursor("c2"), with: .success(LivePage(lives: [live("ada_lovelace", id: 3)], nextCursor: nil)))

    await store.retry()

    #expect(store.lives.map(\.slug.rawValue) == ["jean_dupont", "ada_lovelace"])
    #expect(await directory.requested == [nil, LiveCursor("c2"), LiveCursor("c2")])
  }

  @Test("recharger repart de la première page et remplace la liste")
  func reload() async throws {
    let directory = try FakeDirectory(pages: [
      nil: .success(LivePage(lives: [live("jean_dupont", id: 1)], nextCursor: LiveCursor("c2"))),
      LiveCursor("c2"): .success(LivePage(lives: [live("ada_lovelace", id: 3)], nextCursor: nil)),
    ])
    let store = HomeStore(directory: directory)
    await store.loadFirstPage()
    await store.loadNextPage()
    try await directory.serve(nil, with: .success(LivePage(lives: [live("marie_curie", id: 2)], nextCursor: nil)))

    await store.loadFirstPage()

    #expect(store.lives.map(\.slug.rawValue) == ["marie_curie"])
    #expect(store.phase == .loaded(hasMore: false))
  }

  @Test(
    "réessayer après un rechargement en échec redemande la première page, même en fin de liste",
    arguments: [nil, LiveCursor("c2")]
  )
  func retryFailedReload(nextCursor: LiveCursor?) async throws {
    let directory = try FakeDirectory(pages: [
      nil: .success(LivePage(lives: [live("jean_dupont", id: 1)], nextCursor: nextCursor)),
    ])
    let store = HomeStore(directory: directory)
    await store.loadFirstPage()
    await directory.serve(nil, with: .failure(DirectoryDown()))
    await store.loadFirstPage()
    try await directory.serve(nil, with: .success(LivePage(lives: [live("marie_curie", id: 2)], nextCursor: nil)))

    await store.retry()

    #expect(store.lives.map(\.slug.rawValue) == ["marie_curie"])
    #expect(store.phase == .loaded(hasMore: false))
    #expect(await directory.requested == [nil, nil, nil])
  }

  @Test("un nouvel essai réussi efface l'échec : réessayer encore ne redemande rien")
  func retryOnlyOnce() async throws {
    let directory = try FakeDirectory(pages: [
      nil: .success(LivePage(lives: [live("jean_dupont", id: 1)], nextCursor: LiveCursor("c2"))),
    ])
    let store = HomeStore(directory: directory)
    await store.loadFirstPage()
    await store.loadNextPage()
    try await directory.serve(LiveCursor("c2"), with: .success(LivePage(lives: [live("ada_lovelace", id: 3)], nextCursor: nil)))
    await store.retry()

    await store.retry()

    #expect(await directory.requested == [nil, LiveCursor("c2"), LiveCursor("c2")])
  }

  @Test("réessayer sans échec ne demande rien")
  func retryWithoutFailure() async throws {
    let directory = try FakeDirectory(pages: [
      nil: .success(LivePage(lives: [live("jean_dupont", id: 1)], nextCursor: LiveCursor("c2"))),
    ])
    let store = HomeStore(directory: directory)
    await store.loadFirstPage()

    await store.retry()

    #expect(await directory.requested == [nil])
  }
}
