import Domain
import Foundation

enum ServerPayload {
  private typealias Message = Components.Schemas.RealtimeChatMessage
  private typealias Rejected = Components.Schemas.RealtimeChatRejected
  private typealias Cleared = Components.Schemas.RealtimeChatUserCleared
  private typealias Revoked = Components.Schemas.RealtimeSessionRevoked

  static func event(name: String, payload: Data?) -> ChatEvent? {
    switch name {
    case "chat:message": decode(Message.self, payload).map { .message(ChatMessage($0)) }
    case "chat:user_cleared": decode(Cleared.self, payload).map { .cleared(ChatClearance(channelID: ChannelID($0.channelId), authorID: $0.userId)) }
    case "session:revoked": decode(Revoked.self, payload).map { .revoked(SessionRevocation($0.action)) }
    default: nil
    }
  }

  static func sendOutcome(_ payload: Data?) -> ChatSendOutcome? {
    guard let payload else {
      return .accepted
    }
    return decode(Rejected.self, payload).map { .rejected(ChatRejectionReason($0.reason)) }
  }

  private static let withFraction = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
  private static let withoutFraction = Date.ISO8601FormatStyle()

  private static func decode<Value: Decodable>(_: Value.Type, _ payload: Data?) -> Value? {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .custom { decoder in
      let text = try decoder.singleValueContainer().decode(String.self)
      guard let date = (try? withFraction.parse(text)) ?? (try? withoutFraction.parse(text)) else {
        throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: text))
      }
      return date
    }
    return payload.flatMap { try? decoder.decode(Value.self, from: $0) }
  }
}

private extension ChatMessage {
  init(_ message: Components.Schemas.RealtimeChatMessage) {
    self.init(
      id: message.id,
      channelID: ChannelID(message.channelId),
      sessionID: message.sessionId,
      author: ChatAuthor(id: message.author.id, displayName: message.author.displayName),
      body: message.body,
      sentAt: message.sentAt
    )
  }
}

private extension ChatRejectionReason {
  init(_ reason: Components.Schemas.RealtimeChatRejected.ReasonPayload) {
    self.init(rawValue: reason.value2 ?? "")
  }
}

private extension SessionRevocation {
  init(_ action: Components.Schemas.RealtimeSessionRevoked.ActionPayload) {
    self.init(rawValue: action.value2 ?? "")
  }
}
