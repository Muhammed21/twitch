import Domain
import Foundation
import Profile
import Testing

private actor FailingThenOwnedChannel: MyChannelRepository {
  private var failuresLeft: Int
  private let owned: OwnedChannel?
  private(set) var asked = 0

  init(failures: Int, owned: OwnedChannel?) {
    failuresLeft = failures
    self.owned = owned
  }

  func ownedChannel() throws -> OwnedChannel? {
    asked += 1
    guard failuresLeft == 0 else {
      failuresLeft -= 1
      throw URLError(.cannotConnectToHost)
    }
    return owned
  }

  func streamKey(of _: ChannelID) throws -> StreamKey {
    throw Refused()
  }

  func rotateStreamKey(of _: ChannelID) throws -> StreamKey {
    throw Refused()
  }

  func update(_: ChannelID, change _: StreamInfoChange) throws -> Channel {
    throw Refused()
  }
}

@MainActor
private final class Delays {
  private(set) var recorded: [Duration] = []

  func wait(_ delay: Duration) {
    recorded.append(delay)
  }
}

@MainActor
private func makeStore(_ repository: any MyChannelRepository, delays: Delays) -> MyChannelStore {
  MyChannelStore(
    repository: repository,
    channels: FakeChannels(title: "Speedrun du dimanche", category: nil, banner: nil),
    copy: { _ in },
    log: { _ in },
    wait: { delay in await delays.wait(delay) }
  )
}

@MainActor
@Suite("Ma chaîne : chargement tenu par le tableau de bord, même après un échec réseau")
struct MyChannelRetryTests {
  @Test("une chaîne qui n'a pas pu se charger se recharge d'elle-même, avec une attente qui double")
  func retriesAfterFailure() async throws {
    let delays = Delays()
    let repository = try FailingThenOwnedChannel(failures: 3, owned: makeOwnedChannel())
    let store = makeStore(repository, delays: delays)

    await store.keepLoaded()

    #expect(try store.phase == .ready(makeOwnedChannel()))
    #expect(delays.recorded == [.seconds(1), .seconds(2), .seconds(4)])
  }

  @Test("un premier échec, vu ailleurs avant le tableau de bord, n'empêche pas le tableau de bord de charger la chaîne")
  func retriesAfterEarlierFailure() async throws {
    let delays = Delays()
    let repository = try FailingThenOwnedChannel(failures: 1, owned: makeOwnedChannel())
    let store = makeStore(repository, delays: delays)
    await store.load()
    #expect(store.phase == .failed)

    await store.keepLoaded()

    #expect(try store.phase == .ready(makeOwnedChannel()))
  }

  @Test("l'attente avant un nouvel essai plafonne à 30 secondes")
  func cappedDelay() async throws {
    let delays = Delays()
    let repository = try FailingThenOwnedChannel(failures: 8, owned: makeOwnedChannel())
    let store = makeStore(repository, delays: delays)

    await store.keepLoaded()

    #expect(delays.recorded == [1, 2, 4, 8, 16, 30, 30, 30].map { Duration.seconds($0) })
  }

  @Test("un compte sans chaîne ou une chaîne déjà chargée ne relance aucun chargement")
  func noRetryWhenSettled() async throws {
    let delays = Delays()
    let without = FailingThenOwnedChannel(failures: 0, owned: nil)
    let loaded = try FailingThenOwnedChannel(failures: 0, owned: makeOwnedChannel())
    let noChannel = makeStore(without, delays: delays)
    let ready = makeStore(loaded, delays: delays)
    await ready.load()

    await noChannel.keepLoaded()
    await ready.keepLoaded()

    #expect(noChannel.phase == .noChannel)
    #expect(await without.asked == 1)
    #expect(await loaded.asked == 1)
    #expect(delays.recorded.isEmpty)
  }

  @Test("quitter l'écran arrête les nouveaux essais")
  func stopsWhenCancelled() async throws {
    let repository = try FailingThenOwnedChannel(failures: 100, owned: makeOwnedChannel())
    let store = MyChannelStore(
      repository: repository,
      channels: FakeChannels(title: "", category: nil, banner: nil),
      copy: { _ in },
      log: { _ in },
      wait: { _ in throw CancellationError() }
    )

    await store.keepLoaded()

    #expect(store.phase == .failed)
    #expect(await repository.asked == 1)
  }
}
