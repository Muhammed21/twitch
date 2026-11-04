import DesignSystem
import Domain
import Foundation
import SwiftUI

struct ChatLine: Equatable {
  let time: String
  let authorID: UUID
  let author: String
  let body: String
}

extension ChatLine {
  init(_ message: ChatMessage, locale: Locale, timeZone: TimeZone) {
    let style = Date.FormatStyle(locale: locale, timeZone: timeZone)
      .hour(.twoDigits(amPM: .omitted))
      .minute(.twoDigits)
    self.init(
      time: message.sentAt.formatted(style),
      authorID: message.author.id,
      author: "\(message.author.displayName):",
      body: message.body
    )
  }

  var styled: AttributedString {
    let separator = AttributedString(" ")
    return Self.styled(time, color: .textSecondary)
      + separator
      + Self.styled(author, color: .chatName(authorID), font: TextRole.chatAuthor.font)
      + separator
      + Self.styled(body, color: .textPrimary)
  }

  private static func styled(_ text: String, color: ColorRole, font: Font = TextRole.chatMessage.font) -> AttributedString {
    AttributedString(text, attributes: AttributeContainer().foregroundColor(color.color).font(font))
  }
}

enum ChatDraft {
  private static let maxLength = 500

  static func sendable(_ text: String) -> String? {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty, trimmed.utf16.count <= maxLength else {
      return nil
    }
    return trimmed
  }
}

struct ComposerFeedback: Equatable {
  let clearsDraft: Bool
  let notice: String?
}

extension ComposerFeedback {
  init(_ outcome: ChatSendOutcome?) {
    switch outcome {
    case .accepted: self.init(clearsDraft: true, notice: nil)
    case let .rejected(reason): self.init(clearsDraft: false, notice: ChatText.rejection(reason))
    case nil: self.init(clearsDraft: false, notice: ChatText.unsent)
    }
  }

  func draft(_ current: String, after sent: String) -> String {
    clearsDraft && ChatDraft.sendable(current) == sent ? "" : current
  }
}

enum ChatNotice {
  static func text(for status: ChatSession.Status) -> String? {
    switch status {
    case .live: nil
    case .connecting: ChatText.localized("chat.status.connecting")
    case .reconnecting: ChatText.localized("chat.status.reconnecting")
    case .denied: ChatText.localized("chat.status.denied")
    case .halted: ChatText.localized("chat.status.halted")
    case .signedOut: ChatText.localized("chat.status.signedOut")
    }
  }
}

enum ChatText {
  static var placeholder: String { localized("chat.composer.placeholder") }
  static var send: String { localized("chat.composer.send") }
  static var unsent: String { localized("chat.rejection.unsent") }
  static var timeOutAction: String { localized("chat.moderation.timeOut") }

  static func moderation(_ notice: ChatSession.ModerationNotice) -> String {
    switch notice {
    case let .timedOut(name): String(format: localized("chat.moderation.timedOut"), name)
    case .forbidden: localized("chat.moderation.forbidden")
    case let .failed(name): String(format: localized("chat.moderation.failed"), name)
    }
  }

  static func rejection(_ reason: ChatRejectionReason) -> String {
    switch reason {
    case .timedOut: localized("chat.rejection.timedOut")
    case .banned: localized("chat.rejection.banned")
    case .rateLimited: localized("chat.rejection.rateLimited")
    case .notJoined: localized("chat.rejection.notJoined")
    case .unknown: unsent
    }
  }

  static func localized(_ key: String.LocalizationValue) -> String {
    String(localized: key, bundle: .module)
  }
}
