import Chat
import Domain
import Foundation
import Testing

@MainActor
@Suite("ChatSession : une connexion ne remet les compteurs à zéro qu'une fois vivante", .timeLimit(.minutes(1)))
struct ChatSessionLivenessTests {
  @Test("deux refresh_and_reconnect de suite, sans signe de vie entre les deux, passent en backoff")
  func revokedTwice() async throws {
    let clock = TestClock()
    let first = FakeConnection()
    let second = FakeConnection()
    let connector = FakeConnector([.open(first), .open(second), .open(FakeConnection())])
    let session = makeSession(connector, clock: clock)
    let run = running(session)
    try await waitUntil { session.status == .live }

    await first.emit([.revoked(.refreshAndReconnect)])
    try await waitUntil { await connector.tokens.count == 2 && session.status == .live }
    await second.emit([.revoked(.refreshAndReconnect)])
    try await waitUntil { await connector.tokens.count == 3 && session.status == .live }
    run.cancel()
    await run.value

    #expect(await connector.tokens == ["token-1", "fresh-2", "fresh-3"])
    #expect(await clock.backoffs == [.seconds(1)])
  }

  @Test("une connexion coupée juste après le handshake ne remet pas le backoff à zéro")
  func droppedRightAway() async throws {
    let clock = TestClock()
    let first = FakeConnection()
    let second = FakeConnection()
    let connector = FakeConnector([.open(first), .open(second), .open(FakeConnection())])
    let session = makeSession(connector, clock: clock)
    let run = running(session)
    try await waitUntil { session.status == .live }

    await first.drop(ChatConnectionError.closed)
    try await waitUntil { await connector.tokens.count == 2 && session.status == .live }
    await second.drop(ChatConnectionError.closed)
    try await waitUntil { await connector.tokens.count == 3 && session.status == .live }
    run.cancel()
    await run.value

    #expect(await clock.backoffs == [.seconds(1), .seconds(2)])
  }

  @Test(
    "une connexion silencieuse est vivante après 30 s",
    arguments: [(29.0, [Duration.seconds(1)]), (30.0, [])]
  )
  func quietButLived(seconds: TimeInterval, backoffs: [Duration]) async throws {
    let clock = TestClock()
    let now = TestNow()
    let connection = FakeConnection()
    let connector = FakeConnector([.refused(.unauthorized), .open(connection), .open(FakeConnection())])
    let session = makeSession(connector, clock: clock, now: now)
    let run = running(session)
    try await waitUntil { session.status == .live }

    now.advance(by: seconds)
    await connection.emit([.revoked(.refreshAndReconnect)])
    try await waitUntil { await connector.tokens.count == 3 && session.status == .live }
    run.cancel()
    await run.value

    #expect(await clock.backoffs == backoffs)
  }

  @Test("une fermeture 1009 est journalisée comme un bug client")
  func messageTooLargeLogged() async throws {
    let log = LogBook()
    let connection = FakeConnection()
    let session = makeSession(FakeConnector([.open(connection)]), log: log)
    let run = running(session)
    try await waitUntil { session.status == .live }

    await connection.drop(ChatConnectionError.messageTooLarge)
    await run.value

    #expect(log.entries == ["chat: frame refused by the server (close 1009), client bug"])
  }
}
