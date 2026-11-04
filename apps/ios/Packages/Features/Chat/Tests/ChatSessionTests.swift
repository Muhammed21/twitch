import Chat
import Domain
import Foundation
import Testing

@MainActor
@Suite("ChatSession : messages du salon, coalescés et bornés (ADR 0011)", .timeLimit(.minutes(1)))
struct ChatSessionMessageTests {
  @Test("se connecte avec le token courant, rejoint le salon et passe en direct")
  func connects() async throws {
    let connection = FakeConnection()
    let connector = FakeConnector([.open(connection)])
    let session = makeSession(connector)
    #expect(session.status == .connecting)

    let run = running(session)
    try await waitUntil { session.status == .live }
    run.cancel()
    await run.value

    #expect(await connector.tokens == ["token-1"])
    #expect(await connection.joined == [channel])
    #expect(await connection.isClosed)
  }

  @Test("les messages reçus dans un intervalle sont publiés en un seul lot")
  func coalesces() async throws {
    let connection = FakeConnection()
    let clock = TestClock()
    let session = makeSession(FakeConnector([.open(connection)]), clock: clock)
    let run = running(session)
    try await waitUntil { session.status == .live }
    let burst = (0 ..< 50).map { message($0) }

    await connection.emit(burst.map { .message($0) })
    try await waitUntil { await connection.isAwaitingEvent }
    try await waitUntil { await clock.waits(on: batchInterval) == 1 }

    #expect(session.messages.isEmpty)
    await clock.fire(batchInterval)
    try await waitUntil { !session.messages.isEmpty }
    #expect(session.messages == burst)
    #expect(await clock.waited.filter { $0 == batchInterval }.count == 1)
    run.cancel()
    await run.value
  }

  @Test("la fenêtre garde les messages les plus récents")
  func boundedWindow() async throws {
    let connection = FakeConnection()
    let clock = TestClock()
    let session = makeSession(FakeConnector([.open(connection)]), clock: clock, window: 3)
    let run = running(session)
    try await waitUntil { session.status == .live }
    let burst = (0 ..< 5).map { message($0) }

    await connection.emit(Array(burst.prefix(2)).map { .message($0) })
    try await waitUntil { await clock.waits(on: batchInterval) == 1 }
    await clock.fire(batchInterval)
    try await waitUntil { session.messages.count == 2 }
    await connection.emit(Array(burst.suffix(3)).map { .message($0) })
    try await waitUntil { await clock.waits(on: batchInterval) == 1 }
    await clock.fire(batchInterval)
    try await waitUntil { session.messages.last == burst.last }

    #expect(session.messages == Array(burst.suffix(3)))
    run.cancel()
    await run.value
  }

  @Test("un message évincé de la fenêtre ne revient pas avec les lots suivants")
  func evictedStaysOut() async throws {
    let connection = FakeConnection()
    let clock = TestClock()
    let session = makeSession(FakeConnector([.open(connection)]), clock: clock, window: 2)
    let run = running(session)
    try await waitUntil { session.status == .live }
    let sequence = (0 ..< 4).map { message($0) }

    for next in sequence {
      await connection.emit([.message(next)])
      try await waitUntil { await clock.waits(on: batchInterval) == 1 }
      await clock.fire(batchInterval)
      try await waitUntil { session.messages.last == next }
    }

    #expect(session.messages == Array(sequence.suffix(2)))
    run.cancel()
    await run.value
  }

  @Test("un message déjà affiché n'est pas publié une seconde fois")
  func deduplicates() async throws {
    let connection = FakeConnection()
    let clock = TestClock()
    let session = makeSession(FakeConnector([.open(connection)]), clock: clock)
    let run = running(session)
    try await waitUntil { session.status == .live }
    let first = message(1)
    let second = message(2)

    await connection.emit([.message(first), .message(first)])
    try await waitUntil { await clock.waits(on: batchInterval) == 1 }
    await clock.fire(batchInterval)
    try await waitUntil { session.messages == [first] }
    await connection.emit([.message(first), .message(second)])
    try await waitUntil { await clock.waits(on: batchInterval) == 1 }
    await clock.fire(batchInterval)
    try await waitUntil { session.messages.count == 2 }

    #expect(session.messages == [first, second])
    run.cancel()
    await run.value
  }
}

@MainActor
@Suite("ChatSession : envoi d'un message", .timeLimit(.minutes(1)))
struct ChatSessionSendTests {
  @Test("l'envoi rend le verdict de l'ack, accepté ou refusé avec son motif")
  func outcome() async throws {
    let connection = FakeConnection(outcomes: [.accepted, .rejected(.rateLimited)])
    let session = makeSession(FakeConnector([.open(connection)]))
    let run = running(session)
    try await waitUntil { session.status == .live }

    #expect(await session.send("salut") == .accepted)
    #expect(await session.send("encore") == .rejected(.rateLimited))
    #expect(await connection.sent == ["salut", "encore"])
    run.cancel()
    await run.value
  }

  @Test("un envoi sans connexion ou sans ack ne rend aucun verdict")
  func unavailable() async throws {
    let connection = FakeConnection()
    let session = makeSession(FakeConnector([.open(connection)]))

    #expect(await session.send("trop tôt") == nil)
    let run = running(session)
    try await waitUntil { session.status == .live }
    #expect(await session.send("sans ack") == nil)
    run.cancel()
    await run.value
  }
}
