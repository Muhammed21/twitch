import Domain

public struct SummaryItem: Equatable, Sendable {
  public let title: String
  public let value: String

  public init(title: String, value: String) {
    self.title = title
    self.value = value
  }
}

public enum JourneySummary {
  public static func items(
    followed: [String],
    preferences: DevicePreferences,
    notifications: NotificationAuthorization?
  ) -> [SummaryItem] {
    let categories = followed.isEmpty ? nil : SummaryItem(title: SummaryText.categories, value: followed.joined(separator: ", "))
    let interests = preferences.interests.isEmpty
      ? nil
      : SummaryItem(title: SummaryText.interests, value: preferences.interests.sorted().joined(separator: ", "))
    let content = preferences.content.hidden.isEmpty
      ? nil
      : SummaryItem(title: SummaryText.content, value: SummaryText.hidden(preferences.content.hidden.count))
    let alerts = notifications.flatMap(notificationItem)
    return [
      categories,
      interests,
      content,
      SummaryItem(title: SummaryText.language, value: PersonalizationText.languageName(preferences.liveLanguage)),
      SummaryItem(title: SummaryText.theme, value: SummaryText.appearance(preferences.appearance)),
      SummaryItem(title: SummaryText.autoplay, value: PersonalizationText.autoplay(preferences.videoAutoplay)),
      alerts,
      SummaryItem(title: SummaryText.chat, value: chatValue(preferences)),
    ].compactMap(\.self)
  }

  private static func notificationItem(_ authorization: NotificationAuthorization) -> SummaryItem? {
    switch authorization {
    case .notDetermined: nil
    case .granted: SummaryItem(title: SummaryText.notifications, value: SummaryText.allowed)
    case .denied: SummaryItem(title: SummaryText.notifications, value: SummaryText.refused)
    }
  }

  private static func chatValue(_ preferences: DevicePreferences) -> String {
    let size = PersonalizationText.chatTextSize(preferences.chatTextSize)
    return preferences.showsChatTimestamps ? String(format: SummaryText.withTimestamps, size) : size
  }
}

enum SummaryText {
  static var categories: String { String(localized: "journey.summary.categories", bundle: .module) }
  static var interests: String { String(localized: "journey.summary.interests", bundle: .module) }
  static var content: String { String(localized: "journey.summary.content", bundle: .module) }
  static var language: String { String(localized: "journey.summary.language", bundle: .module) }
  static var theme: String { String(localized: "journey.summary.theme", bundle: .module) }
  static var autoplay: String { String(localized: "journey.summary.autoplay", bundle: .module) }
  static var notifications: String { String(localized: "journey.summary.notifications", bundle: .module) }
  static var chat: String { String(localized: "journey.summary.chat", bundle: .module) }
  static var allowed: String { String(localized: "journey.summary.on", bundle: .module) }
  static var refused: String { String(localized: "journey.summary.off", bundle: .module) }
  static var withTimestamps: String { String(localized: "journey.summary.withTimestamps", bundle: .module) }

  static func hidden(_ count: Int) -> String {
    String(localized: "journey.summary.hidden \(count)", bundle: .module)
  }

  static func appearance(_ appearance: Appearance) -> String {
    switch appearance {
    case .system: String(localized: "journey.summary.system", bundle: .module)
    case .dark: String(localized: "journey.summary.dark", bundle: .module)
    case .light: String(localized: "journey.summary.light", bundle: .module)
    }
  }
}
