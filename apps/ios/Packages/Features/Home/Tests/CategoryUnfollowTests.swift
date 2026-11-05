import Domain
import Foundation
import Home
import Testing

private actor Recorder: CategoryFollowing {
  private(set) var calls: [String] = []

  func follow(_: CategorySlug) async throws {
    calls.append("follow")
  }

  func unfollow(_: CategorySlug) async throws {
    calls.append("unfollow")
  }
}

private struct Details: CategoryDetails {
  let isFollowing: Bool

  func detail(of _: CategorySlug) async throws -> CategoryDetail {
    CategoryDetail(tags: [], followers: 41, isFollowing: isFollowing)
  }
}

@MainActor
private func makeStore(isFollowing: Bool, recorder: Recorder) async throws -> CategoryHeaderStore {
  let store = try CategoryHeaderCatalog(details: Details(isFollowing: isFollowing), following: recorder, now: { Date.now })
    .store(for: CategorySlug("just-chatting"))
  await store.load()
  return store
}

@MainActor
@Suite("Ne plus suivre une catégorie : menu puis alerte de confirmation (chaine/page-chaine--modale-ne-plus-suivre)")
struct CategoryUnfollowTests {
  @Test("Follow suit tout de suite, sans confirmation")
  func followsAtOnce() async throws {
    let recorder = Recorder()
    let store = try await makeStore(isFollowing: false, recorder: recorder)

    await store.followNow()

    #expect(store.follow.state?.isFollowing == true)
    #expect(store.isConfirmingUnfollow == false)
    #expect(await recorder.calls == ["follow"])
  }

  @Test("Unfollow dans le menu ouvre l'alerte sans rien écrire")
  func asksFirst() async throws {
    let recorder = Recorder()
    let store = try await makeStore(isFollowing: true, recorder: recorder)

    store.requestUnfollow()

    #expect(store.isConfirmingUnfollow)
    #expect(store.follow.state?.isFollowing == true)
    #expect(await recorder.calls.isEmpty)
  }

  @Test("confirmer ferme l'alerte et ne suit plus la catégorie")
  func confirms() async throws {
    let recorder = Recorder()
    let store = try await makeStore(isFollowing: true, recorder: recorder)
    store.requestUnfollow()

    await store.confirmUnfollow()

    #expect(store.isConfirmingUnfollow == false)
    #expect(store.follow.state == FollowState(isFollowing: false, followers: 40))
    #expect(await recorder.calls == ["unfollow"])
  }

  @Test("Cancel ferme l'alerte et garde le suivi")
  func cancels() async throws {
    let recorder = Recorder()
    let store = try await makeStore(isFollowing: true, recorder: recorder)
    store.requestUnfollow()

    store.cancelUnfollow()

    #expect(store.isConfirmingUnfollow == false)
    #expect(store.follow.state?.isFollowing == true)
    #expect(await recorder.calls.isEmpty)
  }

  @Test("une catégorie non suivie n'ouvre pas l'alerte, et Follow ne désabonne jamais")
  func nothingToUnfollow() async throws {
    let recorder = Recorder()
    let notFollowing = try await makeStore(isFollowing: false, recorder: recorder)
    let following = try await makeStore(isFollowing: true, recorder: recorder)

    notFollowing.requestUnfollow()
    await following.followNow()

    #expect(notFollowing.isConfirmingUnfollow == false)
    #expect(following.follow.state?.isFollowing == true)
    #expect(await recorder.calls.isEmpty)
  }
}
