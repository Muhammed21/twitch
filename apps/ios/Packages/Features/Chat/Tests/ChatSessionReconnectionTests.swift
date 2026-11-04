import Chat
import Domain
import Foundation
import Testing

@MainActor
@Suite("ChatSession : table de reconnexion (ADR 0023 §3)", .timeLimit(.minutes(1)))
struct ChatSessionReconnectionTests {
  @Test("un 401 au handshake rafraîchit le token puis reconnecte sans attendre")
  func unauthorizedOnce() async throws {
    let tokens = FakeTokens()
    let clock = TestClock()
    let connector = FakeConnector([.refused(.unauthorized), .open(FakeConnection())])
    let session = makeSession(connector, tokens: tokens, clock: clock)

    let run = running(session)
    try await waitUntil { session.status == .live }
    run.cancel()
    await run.value

    #expect(await tokens.rejected == ["token-1"])
    #expect(await connector.tokens == ["token-1", "fresh-2"])
    #expect(await clock.backoffs.isEmpty)
  }

  @Test("un second 401 consécutif avec un token neuf passe en backoff")
  func unauthorizedTwice() async throws {
    let tokens = FakeTokens()
    let clock = TestClock()
    let connector = FakeConnector([.refused(.unauthorized), .refused(.unauthorized), .open(FakeConnection())])
    let session = makeSession(connector, tokens: tokens, clock: clock)

    let run = running(session)
    try await waitUntil { session.status == .live }
    run.cancel()
    await run.value

    #expect(await tokens.rejected == ["token-1", "fresh-2"])
    #expect(await connector.tokens == ["token-1", "fresh-2", "fresh-3"])
    #expect(await clock.backoffs == [.seconds(1)])
  }

  @Test("un 403 au handshake arrête définitivement la session")
  func forbidden() async {
    let connector = FakeConnector([.refused(.forbidden)])
    let session = makeSession(connector)

    await session.run(in: channel)

    #expect(session.status == .denied)
    #expect(await connector.tokens.count == 1)
  }

  @Test("session:revoked refresh_and_reconnect ferme, rafraîchit et reconnecte sans attendre")
  func revokedRefresh() async throws {
    let tokens = FakeTokens()
    let clock = TestClock()
    let connection = FakeConnection()
    let connector = FakeConnector([.open(connection)])
    let session = makeSession(connector, tokens: tokens, clock: clock)
    let run = running(session)
    try await waitUntil { session.status == .live }

    await connection.emit([.revoked(.refreshAndReconnect)])
    try await waitUntil { await connector.tokens.count == 2 }
    try await waitUntil { session.status == .live }
    run.cancel()
    await run.value

    #expect(await connection.isClosed)
    #expect(await tokens.rejected == ["token-1"])
    #expect(await connector.tokens == ["token-1", "fresh-2"])
    #expect(await clock.backoffs.isEmpty)
  }

  @Test("une connexion vivante après un 401 remet le compte à zéro : une révocation suivante reconnecte sans attendre")
  func unauthorizedThenRevoked() async throws {
    let clock = TestClock()
    let connection = FakeConnection()
    let connector = FakeConnector([.refused(.unauthorized), .open(connection)])
    let session = makeSession(connector, clock: clock)
    let run = running(session)
    try await waitUntil { session.status == .live }

    await connection.emit([.message(message(1)), .revoked(.refreshAndReconnect)])
    try await waitUntil { await connector.tokens.count == 3 }
    try await waitUntil { session.status == .live }
    run.cancel()
    await run.value

    #expect(await clock.backoffs.isEmpty)
  }

  @Test("une erreur réseau après un 401 oublie le token rejeté et le compte de 401")
  func failureAfterUnauthorized() async throws {
    let tokens = FakeTokens()
    let clock = TestClock()
    let connector = FakeConnector([
      .refused(.unauthorized), .refused(.unavailable), .refused(.unauthorized), .open(FakeConnection()),
    ])
    let session = makeSession(connector, tokens: tokens, clock: clock)

    let run = running(session)
    try await waitUntil { session.status == .live }
    run.cancel()
    await run.value

    #expect(await tokens.rejected == ["token-1", "token-3"])
    #expect(await connector.tokens == ["token-1", "fresh-2", "token-3", "fresh-4"])
    #expect(await clock.backoffs == [.seconds(1)])
  }

  @Test("une révocation sur une connexion vivante remet aussi le backoff à zéro")
  func revokedResetsBackoff() async throws {
    let clock = TestClock()
    let connection = FakeConnection()
    let connector = FakeConnector([
      .refused(.unavailable), .refused(.unavailable), .open(connection), .refused(.unauthorized), .open(FakeConnection()),
    ])
    let session = makeSession(connector, clock: clock)
    let run = running(session)
    try await waitUntil { await connector.tokens.count == 3 && session.status == .live }

    await connection.emit([.message(message(1)), .revoked(.refreshAndReconnect)])
    try await waitUntil { await connector.tokens.count == 5 && session.status == .live }
    run.cancel()
    await run.value

    #expect(await clock.backoffs == [.seconds(1), .seconds(2), .seconds(1)])
  }

  @Test("session:revoked stop ferme la connexion et arrête définitivement la session")
  func revokedStop() async throws {
    let connection = FakeConnection(outcomes: [.accepted])
    let connector = FakeConnector([.open(connection)])
    let session = makeSession(connector)
    let run = running(session)
    try await waitUntil { session.status == .live }

    await connection.emit([.revoked(.stop)])
    await run.value

    #expect(session.status == .denied)
    #expect(await connection.isClosed)
    #expect(await connector.tokens.count == 1)
    #expect(await session.send("après l'arrêt") == nil)
  }

  @Test("une action de révocation inconnue ne coupe pas la session")
  func revokedUnknown() async throws {
    let connection = FakeConnection()
    let clock = TestClock()
    let session = makeSession(FakeConnector([.open(connection)]), clock: clock)
    let run = running(session)
    try await waitUntil { session.status == .live }
    let after = message(1)

    await connection.emit([.revoked(.unknown("logout")), .message(after)])
    try await waitUntil { await clock.waits(on: batchInterval) == 1 }
    await clock.fire(batchInterval)
    try await waitUntil { session.messages == [after] }

    #expect(session.status == .live)
    #expect(await !connection.isClosed)
    run.cancel()
    await run.value
  }

  @Test(
    "une erreur réseau reconnecte en backoff exponentiel, remis à zéro par une connexion vivante",
    arguments: [ChatConnectionError.unavailable, .refused("chatter_unavailable")]
  )
  func backoff(error: ChatConnectionError) async throws {
    let clock = TestClock()
    let dropped = FakeConnection()
    let connector = FakeConnector([
      .refused(error), .refused(error), .refused(error), .open(dropped), .refused(error), .open(FakeConnection()),
    ])
    let session = makeSession(connector, clock: clock)
    let run = running(session)
    try await waitUntil { await clock.backoffs.count == 3 && session.status == .live }

    await dropped.emit([.message(message(1))])
    await dropped.drop(ChatConnectionError.unavailable)
    try await waitUntil { await connector.tokens.count == 6 && session.status == .live }
    run.cancel()
    await run.value

    #expect(await clock.backoffs == [.seconds(1), .seconds(2), .seconds(4), .seconds(1), .seconds(2)])
  }

  @Test("pendant le backoff, la session se dit en reconnexion et garde ses messages")
  func reconnectingKeepsMessages() async throws {
    let clock = TestClock(holding: [batchInterval, .seconds(1)])
    let connection = FakeConnection()
    let session = makeSession(FakeConnector([.open(connection)]), clock: clock)
    let run = running(session)
    try await waitUntil { session.status == .live }
    let kept = message(1)
    await connection.emit([.message(kept)])
    try await waitUntil { await clock.waits(on: batchInterval) == 1 }
    await clock.fire(batchInterval)
    try await waitUntil { session.messages == [kept] }

    await connection.drop(ChatConnectionError.unavailable)
    try await waitUntil { session.status == .reconnecting }

    #expect(session.messages == [kept])
    run.cancel()
    await clock.fire(.seconds(1))
    await run.value
  }

  @Test("l'attente plafonne à 30 s et passe par la gigue")
  func capsAndJitters() async throws {
    let clock = TestClock()
    let connector = FakeConnector(Array(repeating: .refused(.unavailable), count: 7))
    let session = makeSession(connector, clock: clock, jitter: { $0 / 2 })

    let run = running(session)
    try await waitUntil { await clock.backoffs.count == 7 }
    run.cancel()
    await run.value

    #expect(await clock.backoffs == [1, 2, 4, 8, 16, 30, 30].map { Duration.seconds($0) / 2 })
  }

  @Test("une fermeture 1009 arrête la session sans reconnexion")
  func messageTooLarge() async throws {
    let connection = FakeConnection()
    let connector = FakeConnector([.open(connection)])
    let session = makeSession(connector)
    let run = running(session)
    try await waitUntil { session.status == .live }

    await connection.drop(ChatConnectionError.messageTooLarge)
    await run.value

    #expect(session.status == .halted)
    #expect(await connector.tokens.count == 1)
  }

  @Test("sans session de connexion, la session de chat s'arrête sans se connecter")
  func signedOut() async {
    let connector = FakeConnector([])
    let session = makeSession(connector, tokens: FailingTokens(error: SessionError.signedOut))

    await session.run(in: channel)

    #expect(session.status == .signedOut)
    #expect(await connector.tokens.isEmpty)
  }

  @Test("un token momentanément impossible à obtenir passe en backoff")
  func tokenUnavailable() async throws {
    let clock = TestClock()
    let connector = FakeConnector([])
    let session = makeSession(connector, tokens: FailingTokens(error: URLError(.notConnectedToInternet)), clock: clock)

    let run = running(session)
    try await waitUntil { await clock.backoffs.count >= 2 }
    run.cancel()
    await run.value

    #expect(await connector.tokens.isEmpty)
    #expect(session.status == .reconnecting)
  }
}

private struct FailingTokens: AccessTokenProvider {
  let error: any Error

  func accessToken(at _: Date) throws -> String {
    throw error
  }

  func accessTokenRejected(_: String, at _: Date) throws -> String {
    throw error
  }
}
