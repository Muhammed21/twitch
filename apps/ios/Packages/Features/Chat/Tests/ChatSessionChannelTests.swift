import Chat
import Domain
import Foundation
import Testing

private func slug(_ value: String) throws -> ChannelSlug {
  try ChannelSlug(value)
}

@MainActor
@Suite("ChatSession : salon de la chaîne ouverte", .timeLimit(.minutes(1)))
struct ChatSessionChannelTests {
  @Test("la session rejoint le salon de la chaîne trouvée par son slug")
  func joinsBySlug() async throws {
    let other = ChannelID(UUID())
    let connection = FakeConnection()
    let channels = FakeChannels(ids: ["jean_dupont": other])
    let session = makeSession(FakeConnector([.open(connection)]), channels: channels)
    let opened = try slug("jean_dupont")

    let run = Task { await session.run(opened) }
    try await waitUntil { session.status == .live }
    run.cancel()
    await run.value

    #expect(await channels.lookups == ["jean_dupont"])
    #expect(await connection.joined == [other])
  }

  @Test("une chaîne momentanément introuvable est recherchée à nouveau en backoff")
  func retriesLookup() async throws {
    let clock = TestClock()
    let channels = FakeChannels(failures: 2)
    let session = makeSession(FakeConnector([.open(FakeConnection())]), clock: clock, channels: channels)
    let opened = try slug("jean_dupont")

    let run = Task { await session.run(opened) }
    try await waitUntil { session.status == .live }
    run.cancel()
    await run.value

    #expect(await channels.lookups.count == 3)
    #expect(await clock.backoffs == [.seconds(1), .seconds(2)])
  }

  @Test("pendant la recherche de la chaîne, la session se dit en connexion puis en reconnexion")
  func lookupStatus() async throws {
    let clock = TestClock(holding: [batchInterval, .seconds(1)])
    let session = makeSession(FakeConnector([]), clock: clock, channels: FakeChannels(failures: 1))
    let opened = try slug("jean_dupont")

    #expect(session.status == .connecting)
    let run = Task { await session.run(opened) }
    try await waitUntil { session.status == .reconnecting }
    run.cancel()
    await clock.fire(.seconds(1))
    await run.value
  }

  @Test("un 403 sur le salon de la chaîne arrête la session sans la rechercher à nouveau")
  func forbiddenIsFinal() async throws {
    let channels = FakeChannels()
    let connector = FakeConnector([.refused(.forbidden)])
    let session = makeSession(connector, channels: channels)

    try await session.run(slug("jean_dupont"))

    #expect(session.status == .denied)
    #expect(await channels.lookups.count == 1)
    #expect(await connector.tokens.count == 1)
  }

  @Test("ouvrir une autre chaîne repart d'un fil vide")
  func startsEmpty() async throws {
    let clock = TestClock()
    let connection = FakeConnection()
    let connector = FakeConnector([.open(connection), .open(FakeConnection())])
    let session = makeSession(connector, clock: clock)
    let first = try slug("jean_dupont")
    let second = try slug("marie_curie")
    let run = Task { await session.run(first) }
    try await waitUntil { session.status == .live }
    await connection.emit([.message(message(1))])
    try await waitUntil { await clock.waits(on: batchInterval) == 1 }
    await clock.fire(batchInterval)
    try await waitUntil { session.messages.count == 1 }
    run.cancel()
    await run.value

    let next = Task { await session.run(second) }
    try await waitUntil { await connector.tokens.count == 2 && session.status == .live }

    #expect(session.messages.isEmpty)
    next.cancel()
    await next.value
  }
}
