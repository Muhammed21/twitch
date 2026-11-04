import Domain
import Foundation
import Home
import Testing

private struct CategoryUnknown: Error {}

private func live(_ slug: String, id: Int) throws -> LiveChannel {
  let channelID = try ChannelID(#require(UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", id))))
  return try LiveChannel(
    session: StreamSession(channelID: channelID, startedAt: Date(timeIntervalSince1970: TimeInterval(id))),
    slug: ChannelSlug(slug),
    title: "Live \(slug)",
    viewers: nil
  )
}

private struct Request: Hashable {
  let category: String
  let cursor: LiveCursor?
}

private actor FakeCategoryLives: CategoryLives {
  private(set) var requested: [Request] = []
  private let pages: [Request: LivePage]

  init(pages: [Request: LivePage]) {
    self.pages = pages
  }

  func lives(in category: CategorySlug, after cursor: LiveCursor?) async throws -> LivePage {
    let request = Request(category: category.rawValue, cursor: cursor)
    requested.append(request)
    guard let page = pages[request] else { throw CategoryUnknown() }
    return page
  }
}

@MainActor
@Suite("Lives d'une catégorie touchée dans Browse")
struct CategoryLivesCatalogTests {
  @Test("la liste d'une catégorie demande ses lives, puis la page suivante à partir du curseur reçu")
  func pagesOfOneCategory() async throws {
    let source = try FakeCategoryLives(pages: [
      Request(category: "just-chatting", cursor: nil): LivePage(lives: [live("jean_dupont", id: 1)], nextCursor: LiveCursor("c2")),
      Request(category: "just-chatting", cursor: LiveCursor("c2")): LivePage(lives: [live("marie_curie", id: 2)], nextCursor: nil),
    ])
    let store = try CategoryLivesCatalog(source: source).store(for: CategorySlug("just-chatting"))

    await store.loadFirstPage()
    await store.loadNextPage()

    #expect(store.lives.map(\.slug.rawValue) == ["jean_dupont", "marie_curie"])
    #expect(store.phase == .loaded(hasMore: false))
    #expect(await source.requested == [
      Request(category: "just-chatting", cursor: nil),
      Request(category: "just-chatting", cursor: LiveCursor("c2")),
    ])
  }

  @Test("une catégorie inconnue, en 404, laisse la liste en échec avec réessai")
  func unknownCategory() async throws {
    let source = FakeCategoryLives(pages: [:])
    let store = try CategoryLivesCatalog(source: source).store(for: CategorySlug("inconnue"))

    await store.loadFirstPage()

    #expect(store.lives.isEmpty)
    #expect(store.phase == .failed)
  }
}
