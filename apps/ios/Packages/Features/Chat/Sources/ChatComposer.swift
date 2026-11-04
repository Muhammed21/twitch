import DesignSystem
import Domain
import SwiftUI

public struct ChatComposer: View {
  @Environment(ChatSession.self) private var session
  @State private var draft = ""
  @State private var notice: String?
  @State private var isSending = false

  public init() {}

  public var body: some View {
    VStack(alignment: .leading, spacing: LayoutRole.dialogActionGap.points) {
      if let notice {
        Text(notice)
          .font(TextRole.body.font)
          .foregroundStyle(ColorRole.danger.color)
          .accessibilityIdentifier("chat.composer.notice")
      }
      HStack(spacing: LayoutRole.chatInset.points) {
        TextField(ChatText.placeholder, text: $draft)
          .font(TextRole.chatComposer.font)
          .foregroundStyle(ColorRole.textPrimary.color)
          .submitLabel(.send)
          .onSubmit(send)
          .padding(.horizontal, LayoutRole.composerPadding.points)
          .frame(minHeight: LayoutRole.composerHeight.points)
          .background(
            ColorRole.surfaceSecondary.color,
            in: RoundedRectangle(cornerRadius: LayoutRole.composerRadius.points)
          )
          .accessibilityIdentifier("chat.composer.field")
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
    .padding(LayoutRole.chatInset.points)
    .background(ColorRole.background.color)
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
