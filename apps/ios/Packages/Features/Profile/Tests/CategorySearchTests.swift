import Domain
import Foundation
import Profile
import Testing

private actor FakeCatalog: CategoryCatalog {
  private let results: [String: [ChannelCategory]]
  private(set) var queries: [String] = []

  init(results: [String: [ChannelCategory]]) {
    self.results = results
  }

  func categories(matching query: String) throws -> [ChannelCategory] {
    queries.append(query)
    guard let found = results[query] else { throw Refused() }
    return found
  }
}

private actor HeldCatalog: CategoryCatalog {
  private var pending: [String: CheckedContinuation<[ChannelCategory], Never>] = [:]
  private var waiters: [String: CheckedContinuation<Void, Never>] = [:]

  func categories(matching query: String) async -> [ChannelCategory] {
    await withCheckedContinuation { continuation in
      pending[query] = continuation
      waiters.removeValue(forKey: query)?.resume()
    }
  }

  func untilAsked(_ query: String) async {
    guard pending[query] == nil else { return }
    await withCheckedContinuation { waiters[query] = $0 }
  }

  func answer(_ query: String, with categories: [ChannelCategory]) {
    pending.removeValue(forKey: query)?.resume(returning: categories)
  }
}

@MainActor
@Suite("Recherche d'une catégorie pour Edit Stream Info")
struct CategorySearchTests {
  @Test("montre les catégories trouvées pour le texte saisi")
  func showsResults() async {
    let catalog = FakeCatalog(results: ["legends": [honorOfKings, justChatting]])
    let search = CategorySearch(catalog: catalog)

    await search.search("legends")

    #expect(search.phase == .results([honorOfKings, justChatting]))
    #expect(await catalog.queries == ["legends"])
  }

  @Test("dit que la recherche a échoué quand le catalogue ne répond pas")
  func failure() async {
    let search = CategorySearch(catalog: FakeCatalog(results: [:]))

    await search.search("legends")

    #expect(search.phase == .failed)
  }

  @Test("ignore la réponse d'un texte déjà remplacé par un plus récent")
  func ignoresStaleAnswer() async {
    let catalog = HeldCatalog()
    let search = CategorySearch(catalog: catalog)

    let first = Task { await search.search("leg") }
    await catalog.untilAsked("leg")
    let second = Task { await search.search("legends") }
    await catalog.untilAsked("legends")
    await catalog.answer("legends", with: [justChatting])
    await second.value
    await catalog.answer("leg", with: [honorOfKings])
    await first.value

    #expect(search.phase == .results([justChatting]))
  }
}
