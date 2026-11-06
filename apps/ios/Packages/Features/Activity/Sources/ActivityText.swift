import Foundation

public enum ActivityText {
  public static let title = LocalizedStringResource("activity.title", bundle: .module)
  static let notificationsEmptyTitle = LocalizedStringResource("activity.notifications.empty.title", bundle: .module)
  static let notificationsEmptyMessage = LocalizedStringResource("activity.notifications.empty.message", bundle: .module)
  static let whispersEmptyTitle = LocalizedStringResource("activity.whispers.empty.title", bundle: .module)
  static let whispersEmptyMessage = LocalizedStringResource("activity.whispers.empty.message", bundle: .module)
  static let startConversation = LocalizedStringResource("activity.whispers.startConversation", bundle: .module)
}

public enum ActivityTab: CaseIterable, Hashable, Sendable {
  case notifications
  case whispers

  public static let initial = ActivityTab.notifications

  public var title: LocalizedStringResource {
    switch self {
    case .notifications: LocalizedStringResource("activity.tab.notifications", bundle: .module)
    case .whispers: LocalizedStringResource("activity.tab.whispers", bundle: .module)
    }
  }

  public var accessibilityIdentifier: String {
    switch self {
    case .notifications: "activity.tab.notifications"
    case .whispers: "activity.tab.whispers"
    }
  }

  public var empty: ActivityEmpty {
    switch self {
    case .notifications:
      ActivityEmpty(
        title: ActivityText.notificationsEmptyTitle,
        message: ActivityText.notificationsEmptyMessage,
        action: nil
      )
    case .whispers:
      ActivityEmpty(
        title: ActivityText.whispersEmptyTitle,
        message: ActivityText.whispersEmptyMessage,
        action: ActivityText.startConversation
      )
    }
  }
}

public struct ActivityEmpty: Sendable {
  public static let isActionEnabled = false

  public let title: LocalizedStringResource
  public let message: LocalizedStringResource
  public let action: LocalizedStringResource?
}
