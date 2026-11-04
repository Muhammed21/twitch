import Chat
import Domain
import Foundation
import Testing

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
    return Channel(id: ChatTests.channel, slug: slug, title: "Speedrun", ownerID: UUID())
  }
}

@MainActor
private func makeSession(_ connector: FakeConnector, channels: ScriptedChannels, clock: TestClock) -> ChatSession {
  ChatSession(
    connector: connector,
    tokens: FakeTokens(),
    channels: channels,
    moderation: FakeModeration(),
    viewer: { UUID() },
    wait: { await clock.wait($0) },
    jitter: { $0 }
  )
}

@MainActor
@Suite("ChatSession : chaîne introuvable", .timeLimit(.minutes(1)))
struct ChatSessionMissingChannelTests {
  @Test("une chaîne introuvable (404) arrête la session sans la rechercher à nouveau ni se connecter")
  func notFoundIsFinal() async throws {
    let clock = TestClock()
    let channels = ScriptedChannels(refusing: [problem(404)])
    let connector = FakeConnector([])
    let session = makeSession(connector, channels: channels, clock: clock)

    try await session.run(ChannelSlug("live_5c13a4fbd8de"))

    #expect(session.status == .channelNotFound)
    #expect(await channels.lookups == 1)
    #expect(await clock.backoffs.isEmpty)
    #expect(await connector.tokens.isEmpty)
  }

  @Test("une erreur du serveur (503) sur la chaîne est recherchée à nouveau en backoff")
  func serverErrorRetries() async throws {
    let clock = TestClock()
    let channels = ScriptedChannels(refusing: [problem(503)])
    let session = makeSession(FakeConnector([.open(FakeConnection())]), channels: channels, clock: clock)

    let opened = try ChannelSlug("jean_dupont")

    let run = Task { await session.run(opened) }
    try await waitUntil { session.status == .live }
    run.cancel()
    await run.value

    #expect(await channels.lookups == 2)
    #expect(await clock.backoffs == [.seconds(1)])
  }
}
