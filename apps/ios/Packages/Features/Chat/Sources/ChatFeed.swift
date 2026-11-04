import Domain
import Foundation

enum ChatEntry: Equatable, Identifiable {
  case welcome
  case unread
  case message(ChatMessage)

  var id: String {
    switch self {
    case .welcome: "welcome"
    case .unread: "unread"
    case let .message(message): message.id.uuidString
    }
  }
}

enum ChatFeed {
  static func entries(_ messages: [ChatMessage], status: ChatSession.Status, unread: UnreadMarker) -> [ChatEntry] {
    guard status == .live || !messages.isEmpty else {
      return []
    }
    return [.welcome] + messages.flatMap { message in
      message.id == unread.messageID ? [.unread, .message(message)] : [.message(message)]
    }
  }
}

struct UnreadMarker: Equatable {
  private(set) var messageID: UUID?
  private var isSettled = true

  func arrived(_ messages: [ChatMessage], after previous: [ChatMessage], isAtEnd: Bool) -> UnreadMarker {
    let known = Set(previous.map(\.id))
    guard !isAtEnd, isSettled, let first = messages.first(where: { !known.contains($0.id) }) else {
      return self
    }
    return UnreadMarker(messageID: first.id, isSettled: false)
  }

  func reachedEnd() -> UnreadMarker {
    UnreadMarker(messageID: messageID, isSettled: true)
  }
}

struct ChatViewport: Equatable {
  private var visible: Set<UUID> = []

  func appeared(_ id: UUID) -> ChatViewport {
    ChatViewport(visible: visible.union([id]))
  }

  func disappeared(_ id: UUID) -> ChatViewport {
    ChatViewport(visible: visible.subtracting([id]))
  }

  func isAtEnd(after messages: [ChatMessage]) -> Bool {
    messages.last.map { visible.contains($0.id) } ?? true
  }
}
