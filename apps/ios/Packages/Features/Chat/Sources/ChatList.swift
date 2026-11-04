import DesignSystem
import Domain
import SwiftUI

public struct ChatList: View {
  @Environment(ChatSession.self) private var session
  @Environment(\.locale) private var locale
  @Environment(\.timeZone) private var timeZone
  @State private var unread = UnreadMarker()
  @State private var viewport = ChatViewport()

  public init() {}

  public var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: LayoutRole.chatRowGap.points) {
        let entries = ChatFeed.entries(session.messages, status: session.status, unread: unread)
        ForEach(entries) { entry in
          ChatEntryRow(entry: entry)
            .onAppear { appeared(entry) }
            .onDisappear { disappeared(entry) }
        }
        if let notice = session.moderationNotice {
          Text(ChatText.moderation(notice))
            .font(TextRole.chatMessage.font)
            .foregroundStyle(ColorRole.textSecondary.color)
            .accessibilityIdentifier("chat.moderation.notice")
        }
        if let notice = ChatNotice.text(for: session.status) {
          Text(notice)
            .font(TextRole.chatMessage.font)
            .foregroundStyle(ColorRole.textSecondary.color)
            .accessibilityIdentifier("chat.notice")
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(LayoutRole.chatInset.points)
    }
    .defaultScrollAnchor(.bottom)
    .onChange(of: session.messages) { previous, messages in
      unread = unread.arrived(messages, after: previous, isAtEnd: viewport.isAtEnd(after: previous))
    }
    .background(ColorRole.background.color)
    .accessibilityIdentifier("chat.list")
  }

  private func appeared(_ entry: ChatEntry) {
    guard case let .message(message) = entry else {
      return
    }
    viewport = viewport.appeared(message.id)
    if viewport.isAtEnd(after: session.messages) {
      unread = unread.reachedEnd()
    }
  }

  private func disappeared(_ entry: ChatEntry) {
    guard case let .message(message) = entry else {
      return
    }
    viewport = viewport.disappeared(message.id)
  }
}

struct ChatEntryRow: View {
  @Environment(ChatSession.self) private var session
  @Environment(\.locale) private var locale
  @Environment(\.timeZone) private var timeZone
  let entry: ChatEntry

  var body: some View {
    switch entry {
    case .welcome:
      Text(ChatText.welcome)
        .font(TextRole.chatMessage.font)
        .foregroundStyle(ColorRole.textSecondary.color)
        .accessibilityIdentifier("chat.welcome")
    case .unread:
      UnreadSeparator()
    case let .message(message):
      ChatRow(line: ChatLine(message, locale: locale, timeZone: timeZone))
        .contextMenu {
          if session.canTimeOut(message.author) {
            Button(ChatText.timeOutAction, systemImage: "clock") {
              Task { await session.timeOut(message.author) }
            }
            .accessibilityIdentifier("chat.moderation.timeOut")
          }
        }
    }
  }
}

struct ChatRow: View {
  let line: ChatLine

  var body: some View {
    Text(line.styled)
      .font(TextRole.chatMessage.font)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct UnreadSeparator: View {
  var body: some View {
    HStack(spacing: LayoutRole.chatUnreadLabelGap.points) {
      Rectangle()
        .fill(ColorRole.chatUnread.color)
        .frame(height: LayoutRole.chatUnreadLineWidth.points)
      Text(ChatText.unread)
        .font(TextRole.chatMessage.font)
        .foregroundStyle(ColorRole.chatUnread.color)
        .fixedSize()
    }
    .frame(height: LayoutRole.chatUnreadLineWidth.points)
    .padding(.bottom, LayoutRole.chatUnreadGap.points - LayoutRole.chatRowGap.points)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("chat.unread")
  }
}
