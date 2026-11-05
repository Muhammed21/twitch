import DesignSystem
import Domain
import SwiftUI

public struct ChatDisplay: Equatable, Sendable {
  public static let standard = ChatDisplay(textSize: .medium, showsTimestamps: false)

  public let textSize: ChatTextSize
  public let showsTimestamps: Bool

  public init(textSize: ChatTextSize, showsTimestamps: Bool) {
    self.textSize = textSize
    self.showsTimestamps = showsTimestamps
  }

  public init(_ preferences: DevicePreferences) {
    self.init(textSize: preferences.chatTextSize, showsTimestamps: preferences.showsChatTimestamps)
  }

  public var messageRole: TextRole {
    switch textSize {
    case .small: .chatMessageSmall
    case .medium: .chatMessage
    case .large: .chatMessageLarge
    }
  }

  var authorRole: TextRole {
    switch textSize {
    case .small: .chatAuthorSmall
    case .medium: .chatAuthor
    case .large: .chatAuthorLarge
    }
  }
}

public extension EnvironmentValues {
  @Entry var chatDisplay = ChatDisplay.standard
}
