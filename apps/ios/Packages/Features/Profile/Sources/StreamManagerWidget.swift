import DesignSystem
import Domain
import Foundation

public enum StreamManagerWidget: String, CaseIterable, Hashable, Sendable {
  case chat
  case streamInfo
  case streamKey
  case obs

  public static let initial = StreamManagerWidget.chat

  public var title: LocalizedStringResource {
    switch self {
    case .chat: LocalizedStringResource("streamManager.widget.chat", bundle: .module)
    case .streamInfo: LocalizedStringResource("streamManager.widget.streamInfo", bundle: .module)
    case .streamKey: LocalizedStringResource("streamManager.widget.streamKey", bundle: .module)
    case .obs: LocalizedStringResource("streamManager.widget.obs", bundle: .module)
    }
  }

  public var accessibilityIdentifier: String { "streamManager.widget.\(rawValue)" }

  public var icon: WidgetDockIcon {
    switch self {
    case .chat: .glyph(WidgetStyle.chatGlyph)
    case .streamInfo: .system("pencil")
    case .streamKey: .system("key")
    case .obs: .system("slider.horizontal.3")
    }
  }
}

public enum StreamManagerHeaderText {
  public static let title = LocalizedStringResource("profile.streamManager", bundle: .module)
  public static let widgetMenu = LocalizedStringResource("streamManager.widget.menu", bundle: .module)

  public static func offline(status: LiveStatus?) -> LocalizedStringResource? {
    guard case .live = status else {
      return LocalizedStringResource("streamManager.offline", bundle: .module)
    }
    return nil
  }
}
