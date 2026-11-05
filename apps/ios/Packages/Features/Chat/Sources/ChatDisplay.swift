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

  public var line: ChatLineStyle {
    ChatLineStyle(scale: scale, showsTimestamps: showsTimestamps)
  }

  private var scale: ChatTextScale {
    switch textSize {
    case .small: .small
    case .medium: .medium
    case .large: .large
    }
  }
}

public extension EnvironmentValues {
  @Entry var chatDisplay = ChatDisplay.standard
}
