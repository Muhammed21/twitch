import Channel
import Domain
import Foundation
import Testing

private let channelID = ChannelID(UUID(uuidString: "0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d")!)

private func jeanDupont() throws -> ChannelSlug {
  try ChannelSlug("jean_dupont")
}

private func viewers(_ count: Int) throws -> LiveStatus {
  try .live(viewers: ViewerCount(count))
}

private struct Unreachable: Error {}

private enum Connection {
  case refused
  case dropped([LiveStatus])
  case open([LiveStatus])
}

private actor FakeChannels: ChannelRepository {
  private var failures: Int
  private let stallsAfter: Int?
  private(set) var lookups = 0

  init(failures: Int = 0, stallsAfter: Int? = nil) {
    self.failures = failures
    self.stallsAfter = stallsAfter
  }

  func channel(withSlug slug: ChannelSlug) async throws -> Channel {
    lookups += 1
    if let stallsAfter, lookups > stallsAfter {
      try await Task.sleep(for: .seconds(3600))
    }
    guard failures == 0 else {
      failures -= 1
      throw Unreachable()
    }
    return Channel(id: channelID, slug: slug, title: "Speedrun", ownerID: UUID())
  }
}

private actor FakeLiveStatusSource: LiveStatusSource {
  private var script: [Connection]
  private var held: [AsyncThrowingStream<LiveStatus, any Error>.Continuation] = []
  private(set) var opened: [ChannelID] = []

  init(_ script: [Connection]) {
    self.script = script
  }

  func statuses(of channel: ChannelID) async throws -> AsyncThrowingStream<LiveStatus, any Error> {
    opened.append(channel)
    let connection = script.isEmpty ? .open([]) : script.removeFirst()
    let (stream, continuation) = AsyncThrowingStream<LiveStatus, any Error>.makeStream()
    switch connection {
    case .refused:
      throw Unreachable()
    case let .dropped(statuses):
      statuses.forEach { continuation.yield($0) }
      continuation.finish(throwing: Unreachable())
    case let .open(statuses):
      statuses.forEach { continuation.yield($0) }
      held.append(continuation)
    }
    return stream
  }
}

@MainActor
private final class Recorder {
  private(set) var delays: [Duration] = []
  private(set) var ends = 0
  private(set) var lives = 0

  func wait(_ delay: Duration) {
    delays.append(delay)
  }

  func ended() {
    ends += 1
  }

  func wentLive() {
    lives += 1
  }
}

private struct TimedOut: Error {}

@MainActor
private func waitUntil(_ condition: () -> Bool) async throws {
  let deadline = ContinuousClock.now + .seconds(10)
  while !condition() {
    guard ContinuousClock.now < deadline else { throw TimedOut() }
    try await Task.sleep(for: .milliseconds(5))
  }
}

@MainActor
private func makeChannel(
  _ source: FakeLiveStatusSource,
  channels: FakeChannels = FakeChannels(),
  recorder: Recorder
) -> LiveStatusChannel {
  LiveStatusChannel(
    channels: channels,
    source: source,
    onEnded: { recorder.ended() },
    onLive: { recorder.wentLive() },
    wait: { delay in await recorder.wait(delay) }
  )
}

@MainActor
@Suite("LiveStatusChannel : statut du live et compteur de viewers, avec sa propre reconnexion")
struct LiveStatusChannelTests {
  @Test("suit le titre, le statut et le compteur au fil du flux de la chaîne")
  func follows() async throws {
    let recorder = Recorder()
    let source = try FakeLiveStatusSource([.open([viewers(42), viewers(43)])])
    let channel = makeChannel(source, recorder: recorder)
    let slug = try jeanDupont()
    #expect(channel.status == nil)
    #expect(channel.title == nil)

    let running = Task { await channel.run(slug) }
    try await waitUntil { channel.status == (try? viewers(43)) }
    running.cancel()
    await running.value

    #expect(channel.title == "Speedrun")
    #expect(await source.opened == [channelID])
    #expect(!channel.isReconnecting)
    #expect(recorder.ends == 0)
    #expect(recorder.lives == 0)
  }

  @Test("le passage en live d'une chaîne hors live est annoncé une seule fois")
  func announcesLive() async throws {
    let recorder = Recorder()
    let channel = try makeChannel(
      FakeLiveStatusSource([.open([.offline, viewers(3), viewers(4)])]),
      recorder: recorder
    )
    let slug = try jeanDupont()

    let running = Task { await channel.run(slug) }
    try await waitUntil { channel.status == (try? viewers(4)) }
    running.cancel()
    await running.value

    #expect(recorder.lives == 1)
    #expect(recorder.ends == 0)
  }

  @Test("la fin du live reçue par le flux est annoncée une seule fois")
  func announcesEnd() async throws {
    let recorder = Recorder()
    let channel = try makeChannel(FakeLiveStatusSource([.open([viewers(3), .offline, .offline])]), recorder: recorder)
    let slug = try jeanDupont()

    let running = Task { await channel.run(slug) }
    try await waitUntil { channel.status == .offline }
    running.cancel()
    await running.value

    #expect(recorder.ends == 1)
    #expect(recorder.lives == 0)
  }

  @Test("une chaîne hors live dès l'ouverture n'annonce pas de fin")
  func offlineFromStart() async throws {
    let recorder = Recorder()
    let channel = makeChannel(FakeLiveStatusSource([.open([.offline])]), recorder: recorder)
    let slug = try jeanDupont()

    let running = Task { await channel.run(slug) }
    try await waitUntil { channel.status == .offline }
    running.cancel()
    await running.value

    #expect(recorder.ends == 0)
  }

  @Test("une coupure reconnecte avec une attente qui double, remise à zéro par un statut reçu, sans résoudre la chaîne à nouveau")
  func reconnects() async throws {
    let recorder = Recorder()
    let source = try FakeLiveStatusSource([
      .dropped([viewers(5)]), .refused, .refused, .dropped([viewers(6)]), .refused, .open([viewers(7)]),
    ])
    let channels = FakeChannels()
    let channel = makeChannel(source, channels: channels, recorder: recorder)
    let slug = try jeanDupont()

    let running = Task { await channel.run(slug) }
    try await waitUntil { channel.status == (try? viewers(7)) }
    running.cancel()
    await running.value

    #expect(recorder.delays == [.seconds(1), .seconds(2), .seconds(4), .seconds(1), .seconds(2)])
    #expect(await source.opened.count == 6)
    #expect(await channels.lookups == 1)
    #expect(!channel.isReconnecting)
  }

  @Test("pendant la reconnexion, garde le dernier statut et le signale")
  func keepsLastStatusWhileReconnecting() async throws {
    let recorder = Recorder()
    let channel = try makeChannel(FakeLiveStatusSource([.dropped([viewers(5)])]), recorder: recorder)
    let slug = try jeanDupont()

    let running = Task { await channel.run(slug) }
    try await waitUntil { channel.isReconnecting }

    #expect(channel.status == (try? viewers(5)))
    running.cancel()
    await running.value
  }

  @Test("l'attente entre deux essais plafonne à 30 s")
  func capsBackoff() async throws {
    let recorder = Recorder()
    let channel = makeChannel(FakeLiveStatusSource(Array(repeating: .refused, count: 7)), recorder: recorder)
    let slug = try jeanDupont()

    let running = Task { await channel.run(slug) }
    try await waitUntil { recorder.delays.count == 7 }
    running.cancel()
    await running.value

    #expect(recorder.delays == [1, 2, 4, 8, 16, 30, 30].map { .seconds($0) })
  }

  @Test("une chaîne injoignable est redemandée avant d'ouvrir le flux")
  func retriesChannelLookup() async throws {
    let recorder = Recorder()
    let source = FakeLiveStatusSource([.open([.offline])])
    let channel = makeChannel(source, channels: FakeChannels(failures: 2), recorder: recorder)
    let slug = try jeanDupont()

    let running = Task { await channel.run(slug) }
    try await waitUntil { channel.status == .offline }
    running.cancel()
    await running.value

    #expect(recorder.delays == [.seconds(1), .seconds(2)])
    #expect(await source.opened == [channelID])
  }

  @Test("quitter l'écran arrête le flux sans reconnecter, et une nouvelle ouverture repart de zéro")
  func stopsOnCancel() async throws {
    let recorder = Recorder()
    let source = try FakeLiveStatusSource([.open([viewers(9)]), .open([])])
    let channel = makeChannel(source, channels: FakeChannels(stallsAfter: 1), recorder: recorder)
    let slug = try jeanDupont()
    let first = Task { await channel.run(slug) }
    try await waitUntil { channel.status != nil }

    first.cancel()
    await first.value
    #expect(recorder.delays.isEmpty)
    #expect(await source.opened.count == 1)
    #expect(channel.title == "Speedrun")

    let second = Task { await channel.run(slug) }
    try await waitUntil { channel.status == nil }
    #expect(channel.title == nil)
    second.cancel()
    await second.value
  }
}
