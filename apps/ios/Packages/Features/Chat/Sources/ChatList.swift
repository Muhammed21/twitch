import DesignSystem
import Domain
import SwiftUI

public struct ChatList: View {
  @Environment(ChatSession.self) private var session
  @Environment(\.locale) private var locale
  @Environment(\.timeZone) private var timeZone

  public init() {}

  public var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: LayoutRole.chatRowGap.points) {
        ForEach(session.messages, id: \.id) { message in
          ChatRow(line: ChatLine(message, locale: locale, timeZone: timeZone))
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
    .background(ColorRole.background.color)
    .accessibilityIdentifier("chat.list")
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
