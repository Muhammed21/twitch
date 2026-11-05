import Domain
import Foundation
import Home
import Testing

private struct HeaderDown: Error {}

private struct FakeDetails: CategoryDetails {
  let answer: Result<CategoryDetail, HeaderDown>

  func detail(of _: CategorySlug) async throws -> CategoryDetail {
    try answer.get()
  }
}

private struct AlwaysFollows: CategoryFollowing {
  func follow(_: CategorySlug) async throws {}
  func unfollow(_: CategorySlug) async throws {}
}

@MainActor
private func makeStore(_ answer: Result<CategoryDetail, HeaderDown>) throws -> CategoryHeaderStore {
  try CategoryHeaderCatalog(details: FakeDetails(answer: answer), following: AlwaysFollows(), now: { Date.now })
    .store(for: CategorySlug("just-chatting"))
}

@MainActor
@Suite("En-tête d'une catégorie : tags, followers et bouton Follow")
struct CategoryHeaderStoreTests {
  @Test("connecté, l'en-tête lu donne les tags, le compteur et l'état du bouton")
  func signedIn() async throws {
    let store = try makeStore(.success(CategoryDetail(tags: ["IRL"], followers: 41, isFollowing: true)))

    await store.load()

    #expect(store.tags == ["IRL"])
    #expect(store.followers == 41)
    #expect(store.follow.state == FollowState(isFollowing: true, followers: 41))
  }

  @Test("sans compte, le compteur s'affiche mais pas le bouton")
  func signedOut() async throws {
    let store = try makeStore(.success(CategoryDetail(tags: [], followers: 41, isFollowing: nil)))

    await store.load()

    #expect(store.followers == 41)
    #expect(store.follow.state == nil)
  }

  @Test("suivre met le compteur à jour sans attendre une nouvelle lecture")
  func followCountsAtOnce() async throws {
    let store = try makeStore(.success(CategoryDetail(tags: [], followers: 41, isFollowing: false)))
    await store.load()

    await store.follow.toggle()

    #expect(store.followers == 42)
  }

  @Test("un en-tête illisible laisse la catégorie sans tags, compteur ni bouton")
  func unreadable() async throws {
    let store = try makeStore(.failure(HeaderDown()))

    await store.load()

    #expect(store.tags.isEmpty)
    #expect(store.followers == nil)
    #expect(store.follow.state == nil)
  }
}
