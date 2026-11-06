import DesignSystem
import Domain
import SwiftUI

public enum ChatStyle: Sendable {
  case channel
  case widget

  public var showsEmote: Bool {
    switch self {
    case .channel: false
    case .widget: true
    }
  }

  public var isEmoteEnabled: Bool { false }

  public var background: ColorRole {
    switch self {
    case .channel: .background
    case .widget: WidgetChatFieldStyle.background
    }
  }
}

public struct ChatComposer: View {
  @Environment(ChatSession.self) private var session
  @State private var draft = ""
  @State private var notice: String?
  @State private var isSending = false
  private let style: ChatStyle

  public init(style: ChatStyle = .channel) {
    self.style = style
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: LayoutRole.dialogActionGap.points) {
      if let notice {
        Text(notice)
          .font(TextRole.body.font)
          .foregroundStyle(ColorRole.danger.color)
          .accessibilityIdentifier("chat.composer.notice")
      }
      HStack(spacing: LayoutRole.chatInset.points) {
        field
        if ChatDraft.sendable(draft) != nil {
          Button(action: send) {
            Image(systemName: "paperplane")
              .font(TextRole.chatComposer.font)
              .foregroundStyle(ColorRole.textPrimary.color)
          }
          .disabled(isSending)
          .accessibilityLabel(ChatText.send)
          .accessibilityIdentifier("chat.composer.send")
        }
      }
    }
    .padding(style == .widget ? LayoutRole.widgetFieldInset.points : LayoutRole.chatInset.points)
    .background(style.background.color)
  }

  @ViewBuilder private var field: some View {
    switch style {
    case .channel:
      textField
        .padding(.horizontal, LayoutRole.composerPadding.points)
        .frame(minHeight: LayoutRole.composerHeight.points)
        .background(
          ColorRole.surfaceSecondary.color,
          in: RoundedRectangle(cornerRadius: LayoutRole.composerRadius.points)
        )
    case .widget:
      HStack(spacing: LayoutRole.chatInset.points) {
        textField
        WidgetChatFieldStyle.emoteGlyph.image
          .foregroundStyle(ColorRole.textPrimary.color)
          .accessibilityRepresentation {
            Button(ChatText.emotes) {}
              .disabled(!style.isEmoteEnabled)
          }
          .accessibilityIdentifier("chat.composer.emotes")
      }
      .padding(.horizontal, LayoutRole.composerPadding.points)
      .frame(minHeight: LayoutRole.widgetFieldHeight.points)
      .background(
        WidgetChatFieldStyle.background.color,
        in: RoundedRectangle(cornerRadius: LayoutRole.widgetFieldRadius.points)
      )
      .overlay {
        RoundedRectangle(cornerRadius: LayoutRole.widgetFieldRadius.points)
          .strokeBorder(WidgetChatFieldStyle.border.color, lineWidth: LayoutRole.widgetFieldBorderWidth.points)
      }
    }
  }

  private var textField: some View {
    TextField(ChatText.placeholder, text: $draft)
      .font(TextRole.chatComposer.font)
      .foregroundStyle(ColorRole.textPrimary.color)
      .submitLabel(.send)
      .onSubmit(send)
      .accessibilityIdentifier("chat.composer.field")
  }

  private func send() {
    guard let body = ChatDraft.sendable(draft), !isSending else {
      return
    }
    isSending = true
    Task {
      let feedback = await ComposerFeedback(session.send(body))
      draft = feedback.draft(draft, after: body)
      notice = feedback.notice
      isSending = false
    }
  }
}
