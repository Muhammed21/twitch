import DesignSystem
import Domain
import Foundation

struct ChatAnnouncer: Equatable {
  static let interval = Duration.seconds(5)

  private let lastSeen: UUID?
  private let hasStarted: Bool

  init() {
    self.init(lastSeen: nil, hasStarted: false)
  }

  private init(lastSeen: UUID?, hasStarted: Bool) {
    self.lastSeen = lastSeen
    self.hasStarted = hasStarted
  }

  func next(_ messages: [ChatMessage]) -> (ChatAnnouncer, String?) {
    let advanced = ChatAnnouncer(lastSeen: messages.last?.id ?? lastSeen, hasStarted: true)
    guard hasStarted else { return (advanced, nil) }
    let fresh = unseen(in: messages).filter { !$0.isDeleted }
    return (advanced, Self.spoken(fresh))
  }

  private func unseen(in messages: [ChatMessage]) -> ArraySlice<ChatMessage> {
    guard let lastSeen, let index = messages.firstIndex(where: { $0.id == lastSeen }) else {
      return messages[...]
    }
    return messages[messages.index(after: index)...]
  }

  private static func spoken(_ fresh: [ChatMessage]) -> String? {
    guard let latest = fresh.last else { return nil }
    let line = ChatLine(latest, locale: .current, timeZone: .current).spoken(.standard)
    guard fresh.count > 1 else { return line }
    return String(format: ChatText.localized("chat.announcement.many"), fresh.count, line)
  }
}
