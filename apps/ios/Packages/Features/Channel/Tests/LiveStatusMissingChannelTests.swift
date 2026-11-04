import Channel
import Domain
import Foundation
import Testing

private let channelID = ChannelID(UUID(uuidString: "0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d") ?? UUID())

private func problem(_ status: Int) -> ServiceProblem {
  ServiceProblem(type: "about:blank", title: "Problème", status: status, detail: nil)
}

private actor ScriptedChannels: ChannelRepository {
  private var refusals: [ServiceProblem]
  private(set) var lookups = 0

  init(refusing refusals: [ServiceProblem]) {
    self.refusals = refusals
  }

  func channel(withSlug slug: ChannelSlug) throws -> Channel {
    lookups += 1
    guard refusals.isEmpty else {
      throw refusals.removeFirst()
    }
    return Channel(id: channelID, slug: slug, title: "Speedrun", ownerID: UUID())
  }
}

private actor HeldSource: LiveStatusSource {
  private var held: [AsyncThrowingStream<LiveStatus, any Error>.Continuation] = []
  private(set) var opened: [ChannelID] = []

  func statuses(of channel: ChannelID) -> AsyncThrowingStream<LiveStatus, any Error> {
    opened.append(channel)
    let (stream, continuation) = AsyncThrowingStream<LiveStatus, any Error>.makeStream()
    continuation.yield(.offline)
    held.append(continuation)
    return stream
  }
}

private actor Waits {
  private(set) var durations: [Duration] = []

  func wait(_ duration: Duration) {
    durations.append(duration)
  }
}

@MainActor
private func makeChannel(_ channels: ScriptedChannels, source: HeldSource, waits: Waits) -> LiveStatusChannel {
  LiveStatusChannel(
    channels: channels,
    source: source,
    onEnded: {},
    onLive: {},
    wait: { await waits.wait($0) }
  )
}

@MainActor
private func waitUntil(_ condition: () -> Bool) async throws {
  while !condition() {
    try await Task.sleep(for: .milliseconds(5))
  }
}

@MainActor
@Suite("LiveStatusChannel : chaîne introuvable", .timeLimit(.minutes(1)))
struct LiveStatusMissingChannelTests {
  @Test("une chaîne introuvable (404) arrête le suivi sans la rechercher à nouveau ni ouvrir le flux")
  func notFoundIsFinal() async throws {
    let channels = ScriptedChannels(refusing: [problem(404)])
    let source = HeldSource()
    let waits = Waits()
    let channel = makeChannel(channels, source: source, waits: waits)

    try await channel.run(ChannelSlug("live_5c13a4fbd8de"))

    #expect(channel.channelNotFound)
    #expect(!channel.isReconnecting)
    #expect(await channels.lookups == 1)
    #expect(await waits.durations.isEmpty)
    #expect(await source.opened.isEmpty)
  }

  @Test("une erreur du serveur (503) sur la chaîne est recherchée à nouveau en backoff")
  func serverErrorRetries() async throws {
    let channels = ScriptedChannels(refusing: [problem(503)])
    let source = HeldSource()
    let waits = Waits()
    let channel = makeChannel(channels, source: source, waits: waits)
    let opened = try ChannelSlug("jean_dupont")

    let run = Task { await channel.run(opened) }
    try await waitUntil { channel.status == .offline }
    run.cancel()

    #expect(!channel.channelNotFound)
    #expect(await channels.lookups == 2)
    #expect(await waits.durations == [.seconds(1)])
  }

  @Test("une autre chaîne ouverte après une chaîne introuvable n'est plus dite introuvable")
  func reopens() async throws {
    let channels = ScriptedChannels(refusing: [problem(404)])
    let source = HeldSource()
    let channel = makeChannel(channels, source: source, waits: Waits())
    try await channel.run(ChannelSlug("live_5c13a4fbd8de"))
    let opened = try ChannelSlug("jean_dupont")

    let run = Task { await channel.run(opened) }
    try await waitUntil { channel.status == .offline }
    run.cancel()

    #expect(!channel.channelNotFound)
  }
}
