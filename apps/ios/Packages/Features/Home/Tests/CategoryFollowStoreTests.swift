import Domain
import Foundation
import Home
import os
import Testing

private struct FollowDown: Error {}

private enum Call: Equatable {
  case follow(String)
  case unfollow(String)
}

private actor FakeFollowing: CategoryFollowing {
  private(set) var calls: [Call] = []
  private let fails: Bool
  private var gate: CheckedContinuation<Void, Never>?
  private let holds: Bool

  init(fails: Bool = false, holds: Bool = false) {
    self.fails = fails
    self.holds = holds
  }

  func follow(_ category: CategorySlug) async throws {
    try await answer(.follow(category.rawValue))
  }

  func unfollow(_ category: CategorySlug) async throws {
    try await answer(.unfollow(category.rawValue))
  }

  func release() {
    gate?.resume()
    gate = nil
  }

  private func answer(_ call: Call) async throws {
    calls.append(call)
    if holds { await withCheckedContinuation { gate = $0 } }
    if fails { throw FollowDown() }
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
private func makeStore(_ following: FakeFollowing, clock: TestClock = TestClock()) throws -> CategoryFollowStore {
  try CategoryFollowStore(category: CategorySlug("just-chatting"), following: following, now: { clock.now })
}

@MainActor
@Suite("Bouton Follow d'une catégorie : état optimiste, retour en arrière sur erreur")
struct CategoryFollowStoreTests {
  @Test("suivre bascule le bouton et le compteur avant la réponse, puis garde l'état après le 204")
  func optimisticFollow() async throws {
    let following = FakeFollowing(holds: true)
    let store = try makeStore(following)
    store.show(FollowState(isFollowing: false, followers: 41))

    let toggling = Task { await store.toggle() }
    while await following.calls.isEmpty {
      await Task.yield()
    }

    #expect(store.state == FollowState(isFollowing: true, followers: 42))
    #expect(store.isPending)
    await following.release()
    await toggling.value
    #expect(store.state == FollowState(isFollowing: true, followers: 42))
    #expect(!store.isPending)
    #expect(await following.calls == [.follow("just-chatting")])
  }

  @Test("ne plus suivre envoie DELETE et retire un follower")
  func unfollow() async throws {
    let following = FakeFollowing()
    let store = try makeStore(following)
    store.show(FollowState(isFollowing: true, followers: 42))

    await store.toggle()

    #expect(store.state == FollowState(isFollowing: false, followers: 41))
    #expect(await following.calls == [.unfollow("just-chatting")])
  }

  @Test("une erreur remet l'état d'avant et le signale")
  func revertsOnFailure() async throws {
    let store = try makeStore(FakeFollowing(fails: true))
    store.show(FollowState(isFollowing: false, followers: 41))

    await store.toggle()

    #expect(store.state == FollowState(isFollowing: false, followers: 41))
    #expect(store.hasFailed)
    #expect(!store.isPending)
  }

  @Test("pendant une écriture, un second appui n'envoie rien")
  func ignoresSecondTapWhilePending() async throws {
    let following = FakeFollowing(holds: true)
    let store = try makeStore(following)
    store.show(FollowState(isFollowing: false, followers: 41))
    let first = Task { await store.toggle() }
    while await following.calls.isEmpty {
      await Task.yield()
    }

    await store.toggle()
    await following.release()
    await first.value

    #expect(await following.calls == [.follow("just-chatting")])
    #expect(store.state == FollowState(isFollowing: true, followers: 42))
  }

  @Test("sans état connu (lecture pas encore faite, ou pas de compte), toucher ne fait rien")
  func noStateNoWrite() async throws {
    let following = FakeFollowing()
    let store = try makeStore(following)

    await store.toggle()

    #expect(store.state == nil)
    #expect(await following.calls.isEmpty)
  }

  @Test("une nouvelle lecture remplace l'état, sauf pendant une écriture")
  func readDuringWriteIsIgnored() async throws {
    let following = FakeFollowing(holds: true)
    let store = try makeStore(following)
    store.show(FollowState(isFollowing: false, followers: 41))
    let toggling = Task { await store.toggle() }
    while await following.calls.isEmpty {
      await Task.yield()
    }

    store.show(FollowState(isFollowing: false, followers: 41))
    await following.release()
    await toggling.value
    let afterWrite = store.state
    store.show(FollowState(isFollowing: true, followers: 50))

    #expect(afterWrite == FollowState(isFollowing: true, followers: 42))
    #expect(store.state == FollowState(isFollowing: true, followers: 50))
  }

  @Test("une lecture en retard qui contredit l'écriture réussie est ignorée pendant le délai")
  func staleReadAfterWriteIsIgnored() async throws {
    let clock = TestClock()
    let store = try makeStore(FakeFollowing(), clock: clock)
    store.show(FollowState(isFollowing: false, followers: 41))
    await store.toggle()

    clock.advance(by: CategoryFollowStore.readGrace - 1)
    store.show(FollowState(isFollowing: false, followers: 41))

    #expect(store.state == FollowState(isFollowing: true, followers: 42))
  }

  @Test("une lecture qui confirme l'écriture est prise, puis les lectures suivantes aussi")
  func confirmingReadIsTaken() async throws {
    let store = try makeStore(FakeFollowing())
    store.show(FollowState(isFollowing: false, followers: 41))
    await store.toggle()

    store.show(FollowState(isFollowing: true, followers: 43))
    store.show(FollowState(isFollowing: false, followers: 42))

    #expect(store.state == FollowState(isFollowing: false, followers: 42))
  }

  @Test("passé le délai, une lecture qui contredit l'écriture est prise")
  func contradictingReadAfterGraceIsTaken() async throws {
    let clock = TestClock()
    let store = try makeStore(FakeFollowing(), clock: clock)
    store.show(FollowState(isFollowing: false, followers: 41))
    await store.toggle()

    clock.advance(by: CategoryFollowStore.readGrace)
    store.show(FollowState(isFollowing: false, followers: 41))

    #expect(store.state == FollowState(isFollowing: false, followers: 41))
  }

  @Test("après une écriture en échec, la lecture suivante est prise")
  func readAfterFailureIsTaken() async throws {
    let store = try makeStore(FakeFollowing(fails: true))
    store.show(FollowState(isFollowing: false, followers: 41))
    await store.toggle()

    store.show(FollowState(isFollowing: true, followers: 44))

    #expect(store.state == FollowState(isFollowing: true, followers: 44))
  }

  @Test("le délai de tolérance d'une lecture est de 10 s")
  func readGrace() {
    #expect(CategoryFollowStore.readGrace == 10)
  }
}
