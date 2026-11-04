import Chat
import Domain
import Foundation
import Testing

private let timedOut = ChatAuthor(id: UUID(uuidString: "6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d") ?? UUID(), displayName: "yahway_810")
private let otherChannel = ChannelID(UUID(uuidString: "2f3e4d5c-6b7a-4980-8f1e-2d3c4b5a6978") ?? UUID())

private func said(_ body: String, by author: ChatAuthor) -> ChatMessage {
  ChatMessage(
    id: UUID(),
    channelID: channel,
    sessionID: nil,
    author: author,
    body: body,
    sentAt: Date(timeIntervalSince1970: 1_793_736_900)
  )
}

private func deleted(_ message: ChatMessage) -> ChatMessage {
  ChatMessage(
    id: message.id,
    channelID: message.channelID,
    sessionID: message.sessionID,
    author: message.author,
    body: "",
    sentAt: message.sentAt,
    isDeleted: true
  )
}

private func clearance(in channelID: ChannelID = channel) -> ChatEvent {
  .cleared(ChatClearance(channelID: channelID, authorID: timedOut.id))
}

@MainActor
private struct LiveChat {
  let session: ChatSession
  let connection: FakeConnection
  let clock: TestClock
  let run: Task<Void, Never>

  static func open() async throws -> LiveChat {
    let connection = FakeConnection()
    let clock = TestClock()
    let session = makeSession(FakeConnector([.open(connection)]), clock: clock)
    let run = running(session)
    try await waitUntil { session.status == .live }
    return LiveChat(session: session, connection: connection, clock: clock, run: run)
  }

  func publish(_ messages: [ChatMessage]) async throws {
    await connection.emit(messages.map { .message($0) })
    try await waitUntil { await clock.waits(on: batchInterval) == 1 }
    await clock.fire(batchInterval)
    try await waitUntil { session.messages.last == messages.last }
  }

  func close() async {
    run.cancel()
    await run.value
  }
}

@MainActor
@Suite("ChatSession : messages d'un auteur mis en timeout effacés (chat:user_cleared)", .timeLimit(.minutes(1)))
struct ChatSessionClearanceTests {
  @Test("les messages affichés de l'auteur sont marqués supprimés, à leur place, et les autres restent")
  func clearsDisplayedMessages() async throws {
    let chat = try await LiveChat.open()
    let first = said("premier", by: timedOut)
    let other = message(1)
    let second = said("second", by: timedOut)
    try await chat.publish([first, other, second])

    await chat.connection.emit([clearance()])
    try await waitUntil { chat.session.messages.first?.isDeleted == true }

    #expect(chat.session.messages == [deleted(first), other, deleted(second)])
    await chat.close()
  }

  @Test("un message de l'auteur reçu mais pas encore publié est publié supprimé")
  func clearsPendingMessages() async throws {
    let chat = try await LiveChat.open()
    let pending = said("en attente", by: timedOut)

    await chat.connection.emit([.message(pending), clearance()])
    try await waitUntil { await chat.connection.isAwaitingEvent }
    try await waitUntil { await chat.clock.waits(on: batchInterval) == 1 }
    await chat.clock.fire(batchInterval)
    try await waitUntil { !chat.session.messages.isEmpty }

    #expect(chat.session.messages == [deleted(pending)])
    await chat.close()
  }

  @Test("un effacement visant un autre salon ne touche à rien")
  func ignoresOtherChannel() async throws {
    let chat = try await LiveChat.open()
    let kept = said("toujours là", by: timedOut)
    try await chat.publish([kept])

    await chat.connection.emit([clearance(in: otherChannel)])
    try await waitUntil { await chat.connection.isAwaitingEvent }

    #expect(chat.session.messages == [kept])
    await chat.close()
  }

  @Test("un message de l'auteur reçu après l'effacement s'affiche normalement")
  func laterMessageStays() async throws {
    let chat = try await LiveChat.open()
    let before = said("avant", by: timedOut)
    let after = said("après", by: timedOut)
    try await chat.publish([before])
    await chat.connection.emit([clearance()])
    try await waitUntil { chat.session.messages.first?.isDeleted == true }

    try await chat.publish([after])

    #expect(chat.session.messages == [deleted(before), after])
    await chat.close()
  }
}
