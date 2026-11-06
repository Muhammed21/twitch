import Domain
import Foundation
import Home
import os
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

private struct InterruptedDirectory: LiveDirectory {
  let first: LivePage?
  let error: any Error

  init(first: LivePage? = nil, error: any Error) {
    self.first = first
    self.error = error
  }

  func lives(after cursor: LiveCursor?) async throws -> LivePage {
    guard cursor == nil, let first else { throw error }
    return first
  }
}

private final class TestClock: Sendable {
  private let current = OSAllocatedUnfairLock(initialState: Date(timeIntervalSince1970: 1_800_000_000))

  var now: Date {
    current.withLock { $0 }
  }

  func advance(by seconds: TimeInterval) {
    current.withLock { $0 = $0.addingTimeInterval(seconds) }
  }
}

@MainActor
@Suite("Accueil : lives démarrés après le premier chargement")
struct HomeStoreFreshnessTests {
  @Test("au retour sur l'accueil, la liste chargée il y a plus de 30 s est redemandée et montre le nouveau live")
  func staleListReloads() async throws {
    let clock = TestClock()
    let directory = FakeDirectory(pages: [nil: .success(LivePage(lives: [], nextCursor: nil))])
    let store = HomeStore(directory: directory, now: { clock.now })
    await store.appeared()
    let started = try live("muhammed", id: 1)
    await directory.serve(nil, with: .success(LivePage(lives: [started], nextCursor: nil)))

    clock.advance(by: 31)
    await store.appeared()

    #expect(store.lives == [started])
    #expect(await directory.requested == [nil, nil])
  }

  @Test("revenir sur l'accueil moins de 30 s après le chargement ne redemande rien et garde la pagination")
  func freshListKept() async throws {
    let clock = TestClock()
    let directory = try FakeDirectory(pages: [
      nil: .success(LivePage(lives: [live("jean_dupont", id: 1)], nextCursor: LiveCursor("c2"))),
      LiveCursor("c2"): .success(LivePage(lives: [live("marie_curie", id: 2)], nextCursor: nil)),
    ])
    let store = HomeStore(directory: directory, now: { clock.now })
    await store.appeared()
    await store.loadNextPage()

    clock.advance(by: 30)
    await store.appeared()

    #expect(store.lives.map(\.slug.rawValue) == ["jean_dupont", "marie_curie"])
    #expect(await directory.requested == [nil, LiveCursor("c2")])
  }

  @Test("tirer pour rafraîchir repart l'horloge : le retour suivant ne redemande rien")
  func pullToRefreshCountsAsFresh() async {
    let clock = TestClock()
    let directory = FakeDirectory(pages: [nil: .success(LivePage(lives: [], nextCursor: nil))])
    let store = HomeStore(directory: directory, now: { clock.now })
    await store.appeared()

    clock.advance(by: 25)
    await store.loadFirstPage()
    clock.advance(by: 25)
    await store.appeared()

    #expect(await directory.requested == [nil, nil])
  }

  @Test("après un échec, revenir sur l'accueil redemande la première page")
  func failedListReloads() async {
    let directory = FakeDirectory(pages: [:])
    let store = HomeStore(directory: directory)
    await store.appeared()

    await store.appeared()

    #expect(await directory.requested == [nil, nil])
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

  @Test("une tâche annulée remet l'accueil à charger, sans erreur")
  func cancelledTaskIsNotAFailure() async {
    let store = HomeStore(directory: InterruptedDirectory(error: CancellationError()))

    await store.loadFirstPage()

    #expect(store.phase == .idle)
  }

  @Test("une requête réseau annulée remet l'accueil à charger, sans erreur")
  func cancelledRequestIsNotAFailure() async {
    let store = HomeStore(directory: InterruptedDirectory(error: URLError(.cancelled)))

    await store.loadFirstPage()

    #expect(store.phase == .idle)
  }

  @Test("une page suivante annulée garde la liste prête à reprendre la pagination")
  func cancelledNextPageKeepsPagination() async throws {
    let first = try LivePage(lives: [live("jean_dupont", id: 1)], nextCursor: LiveCursor("c2"))
    let store = HomeStore(directory: InterruptedDirectory(first: first, error: URLError(.cancelled)))
    await store.loadFirstPage()

    await store.loadNextPage()

    #expect(store.phase == .loaded(hasMore: true))
    #expect(store.lives.map(\.slug.rawValue) == ["jean_dupont"])
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

  @Test("chaque rechargement réussi de la première page renouvelle les vignettes, pas la page suivante ni un échec")
  func thumbnailsFollowReload() async throws {
    let directory = try FakeDirectory(pages: [
      nil: .success(LivePage(lives: [live("jean_dupont", id: 1)], nextCursor: LiveCursor("c2"))),
      LiveCursor("c2"): .success(LivePage(lives: [live("ada_lovelace", id: 3)], nextCursor: nil)),
    ])
    let store = HomeStore(directory: directory)
    await store.loadFirstPage()
    let first = store.thumbnailGeneration

    await store.loadNextPage()
    let afterNextPage = store.thumbnailGeneration
    await store.loadFirstPage()
    let afterReload = store.thumbnailGeneration
    await directory.serve(nil, with: .failure(DirectoryDown()))
    await store.loadFirstPage()

    #expect(afterNextPage == first)
    #expect(afterReload != first)
    #expect(store.thumbnailGeneration == afterReload)
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
