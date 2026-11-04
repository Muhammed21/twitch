@testable import ChatTransport
import Domain
import Foundation
import Testing

private let messageID = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
private let channelID = "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69"
private let sessionID = "7e6d5c4b-3a29-4180-9f7e-6d5c4b3a2918"
private let authorID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b"

private func uuid(_ text: String) -> UUID {
  UUID(uuidString: text) ?? UUID()
}

private func messageJSON(
  sentAt: String = "2026-11-03T20:15:00.250Z",
  session: String = #","sessionId":"\#(sessionID)""#,
  extra: String = ""
) -> Data {
  Data(
    #"""
    {"id":"\#(messageID)","channelId":"\#(channelID)"\#(session),\#
    "author":{"id":"\#(authorID)","displayName":"Viewer de test"},\#
    "body":"Bonjour le chat","sentAt":"\#(sentAt)"\#(extra)}
    """#.utf8
  )
}

private func expectedMessage(sessionID: UUID? = uuid(sessionID), sentAt: Date) -> ChatMessage {
  ChatMessage(
    id: uuid(messageID),
    channelID: ChannelID(uuid(channelID)),
    sessionID: sessionID,
    author: ChatAuthor(id: uuid(authorID), displayName: "Viewer de test"),
    body: "Bonjour le chat",
    sentAt: sentAt
  )
}

private let quarterPast = Date(timeIntervalSince1970: 1_793_736_900)

@Suite("Charges des événements serveur (contrat Realtime*)")
struct ServerPayloadTests {
  @Test("chat:message devient un message du domaine")
  func message() {
    let event = ServerPayload.event(name: "chat:message", payload: messageJSON())

    #expect(event == .message(expectedMessage(sentAt: quarterPast.addingTimeInterval(0.25))))
  }

  @Test("une date sans fraction de seconde se lit aussi")
  func messageWithoutFraction() {
    let event = ServerPayload.event(name: "chat:message", payload: messageJSON(sentAt: "2026-11-03T20:15:00Z"))

    #expect(event == .message(expectedMessage(sentAt: quarterPast)))
  }

  @Test("un message hors session de live n'a pas de session")
  func messageWithoutSession() {
    let event = ServerPayload.event(name: "chat:message", payload: messageJSON(session: ""))

    #expect(event == .message(expectedMessage(sessionID: nil, sentAt: quarterPast.addingTimeInterval(0.25))))
  }

  @Test("un champ inconnu ne gêne pas la lecture d'un message")
  func messageWithUnknownField() {
    let event = ServerPayload.event(name: "chat:message", payload: messageJSON(extra: #","pinned":true"#))

    #expect(event == .message(expectedMessage(sentAt: quarterPast.addingTimeInterval(0.25))))
  }

  @Test(
    "un message hors contrat est rejeté",
    arguments: [
      Data(#"{"id":"\#(messageID)"}"#.utf8),
      messageJSON(sentAt: "hier"),
      messageJSON(session: #","sessionId":"session-1""#),
      Data("[]".utf8),
      Data("{".utf8),
    ]
  )
  func malformedMessage(payload: Data) {
    #expect(ServerPayload.event(name: "chat:message", payload: payload) == nil)
  }

  @Test("un message sans charge est rejeté")
  func messageWithoutPayload() {
    #expect(ServerPayload.event(name: "chat:message", payload: nil) == nil)
  }

  @Test(
    "session:revoked donne l'action demandée, connue ou non",
    arguments: [
      ("refresh_and_reconnect", SessionRevocation.refreshAndReconnect),
      ("stop", SessionRevocation.stop),
      ("logout", SessionRevocation.unknown("logout")),
    ]
  )
  func revoked(action: String, expected: SessionRevocation) {
    let event = ServerPayload.event(name: "session:revoked", payload: Data(#"{"action":"\#(action)"}"#.utf8))

    #expect(event == .revoked(expected))
  }

  @Test(
    "une révocation hors contrat est rejetée",
    arguments: [Data("{}".utf8), Data(#"{"action":1}"#.utf8), Data("{".utf8)]
  )
  func malformedRevoked(payload: Data) {
    #expect(ServerPayload.event(name: "session:revoked", payload: payload) == nil)
  }

  @Test("chat:user_cleared nomme l'auteur dont les messages sont effacés du salon")
  func userCleared() {
    let payload = Data(#"{"channelId":"\#(channelID)","userId":"\#(authorID)"}"#.utf8)

    let event = ServerPayload.event(name: "chat:user_cleared", payload: payload)

    #expect(event == .cleared(ChatClearance(channelID: ChannelID(uuid(channelID)), authorID: uuid(authorID))))
  }

  @Test(
    "un effacement hors contrat est rejeté",
    arguments: [
      Data(#"{"channelId":"\#(channelID)"}"#.utf8),
      Data(#"{"channelId":"\#(channelID)","userId":"viewer-1"}"#.utf8),
      Data("{".utf8),
    ]
  )
  func malformedUserCleared(payload: Data) {
    #expect(ServerPayload.event(name: "chat:user_cleared", payload: payload) == nil)
  }

  @Test("un événement inconnu est rejeté", arguments: ["chat:delete", "chat:rejected", "", "Chat:message"])
  func unknownEvent(name: String) {
    #expect(ServerPayload.event(name: name, payload: messageJSON()) == nil)
  }

  @Test("un ack vide accepte le message")
  func acceptedAck() {
    #expect(ServerPayload.sendOutcome(nil) == .accepted)
  }

  @Test(
    "un ack porteur d'un motif refuse le message, motif connu ou non",
    arguments: [
      ("timed_out", ChatRejectionReason.timedOut),
      ("banned", ChatRejectionReason.banned),
      ("rate_limited", ChatRejectionReason.rateLimited),
      ("not_joined", ChatRejectionReason.notJoined),
      ("slow_mode", ChatRejectionReason.unknown("slow_mode")),
    ]
  )
  func rejectedAck(reason: String, expected: ChatRejectionReason) {
    #expect(ServerPayload.sendOutcome(Data(#"{"reason":"\#(reason)"}"#.utf8)) == .rejected(expected))
  }

  @Test(
    "un ack hors contrat est rejeté",
    arguments: [Data("{}".utf8), Data(#"{"reason":3}"#.utf8), Data("true".utf8), Data("{".utf8)]
  )
  func malformedAck(payload: Data) {
    #expect(ServerPayload.sendOutcome(payload) == nil)
  }
}
