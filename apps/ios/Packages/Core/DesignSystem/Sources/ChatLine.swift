import Foundation
import SwiftUI

public enum ChatTextScale: Sendable, CaseIterable {
  case small
  case medium
  case large
}

public struct ChatLineStyle: Equatable, Sendable {
  public static let standard = ChatLineStyle(scale: .medium, showsTimestamps: false)

  public let scale: ChatTextScale
  public let showsTimestamps: Bool

  public init(scale: ChatTextScale, showsTimestamps: Bool) {
    self.scale = scale
    self.showsTimestamps = showsTimestamps
  }

  public var messageRole: TextRole {
    switch scale {
    case .small: .chatMessageSmall
    case .medium: .chatMessage
    case .large: .chatMessageLarge
    }
  }

  public var authorRole: TextRole {
    switch scale {
    case .small: .chatAuthorSmall
    case .medium: .chatAuthor
    case .large: .chatAuthorLarge
    }
  }
}

public struct ChatLine: Equatable, Sendable {
  public let time: String
  public let authorID: UUID
  public let author: String
  public let body: String
  public let isDeleted: Bool
  public let badges: [Glyph]
  public let nameColor: ChatNameColor?

  public init(
    time: String,
    authorID: UUID,
    author: String,
    body: String,
    isDeleted: Bool = false,
    badges: [Glyph] = [],
    nameColor: ChatNameColor? = nil
  ) {
    self.time = time
    self.authorID = authorID
    self.author = author
    self.body = body
    self.isDeleted = isDeleted
    self.badges = badges
    self.nameColor = nameColor
  }

  public func spoken(_ style: ChatLineStyle) -> String {
    let message = "\(author) \(body)"
    return style.showsTimestamps ? "\(message), \(time)" : message
  }

  public func styled(_ style: ChatLineStyle) -> AttributedString {
    timeStyled(style) + messageStyled(style)
  }

  public func timeStyled(_ style: ChatLineStyle) -> AttributedString {
    guard style.showsTimestamps else { return AttributedString() }
    return Self.styled(time, color: .textSecondary, font: style.messageRole.font) + AttributedString(" ")
  }

  public func messageStyled(_ style: ChatLineStyle) -> AttributedString {
    Self.styled(author, color: nameColor.map(ColorRole.chosenChatName) ?? .chatName(authorID), font: style.authorRole.font)
      + AttributedString(" ")
      + Self.styled(body, color: isDeleted ? .textSecondary : .textPrimary, font: style.messageRole.font)
  }

  private static func styled(_ text: String, color: ColorRole, font: Font) -> AttributedString {
    AttributedString(text, attributes: AttributeContainer().foregroundColor(color.color).font(font))
  }
}

public struct ChatLineRow: View {
  private let line: ChatLine
  private let style: ChatLineStyle

  public init(line: ChatLine, style: ChatLineStyle) {
    self.line = line
    self.style = style
  }

  public var body: some View {
    Text("\(Text(line.timeStyled(style)))\(badges)\(Text(line.messageStyled(style)))")
      .font(style.messageRole.font)
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(verbatim: line.spoken(style)))
  }

  private var badges: Text {
    line.badges
      .compactMap { $0.inline(side: LayoutRole.chatBadgeSize.points) }
      .map { Text("\(Image(uiImage: $0)) ").foregroundStyle(ColorRole.accent.color).baselineOffset(-LayoutRole.chatBadgeDrop.points) }
      .reduce(Text(verbatim: "")) { Text("\($0)\($1)") }
  }
}
