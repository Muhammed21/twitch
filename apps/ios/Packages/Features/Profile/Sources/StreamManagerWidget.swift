import DesignSystem
import Domain
import Foundation
import SwiftUI

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

public enum StreamManagerSpoken {
  public static func key(_ revealed: String?) -> String {
    revealed ?? String(localized: "streamManager.streamKey.hidden", bundle: .module)
  }

  public static func title(_ title: String) -> String {
    title.isEmpty ? String(localized: "streamManager.title.empty", bundle: .module) : title
  }

  public static func announcement(for notice: MyChannelStore.Notice?) -> String? {
    notice.map { String(localized: ProfileText.notice($0)) }
  }
}

public struct StreamManagerChatSlot: Sendable {
  private let make: (@MainActor @Sendable (ChannelSlug) -> AnyView)?

  public init(_ make: @escaping @MainActor @Sendable (ChannelSlug) -> AnyView) {
    self.make = make
  }

  init() {
    make = nil
  }

  public var isProvided: Bool { make != nil }

  @MainActor
  func view(for slug: ChannelSlug) -> AnyView {
    make?(slug) ?? AnyView(EmptyView())
  }
}

public extension EnvironmentValues {
  @Entry var streamManagerChat = StreamManagerChatSlot()
}
