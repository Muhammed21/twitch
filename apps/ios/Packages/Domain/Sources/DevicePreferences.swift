import Foundation

public enum Appearance: String, CaseIterable, Sendable {
  case system
  case dark
  case light
}

public enum VideoAutoplay: String, CaseIterable, Sendable {
  case wifiAndMobileData = "wifi_and_mobile_data"
  case wifiOnly = "wifi_only"
  case never

  public func allowsPlayback(onExpensiveNetwork isExpensive: Bool) -> Bool {
    switch self {
    case .wifiAndMobileData: true
    case .wifiOnly: !isExpensive
    case .never: false
    }
  }
}

public enum ChatTextSize: String, CaseIterable, Sendable {
  case small
  case medium
  case large
}

public enum LiveLanguage: String, CaseIterable, Sendable {
  case english = "en"
  case french = "fr"
  case german = "de"
  case spanish = "es"
  case portuguese = "pt"
  case italian = "it"
  case japanese = "ja"
  case korean = "ko"
  case chinese = "zh"
  case russian = "ru"
  case polish = "pl"
  case turkish = "tr"

  public init(localeIdentifier: String) {
    let code = Locale(identifier: localeIdentifier).language.languageCode?.identifier ?? ""
    self = LiveLanguage(rawValue: code) ?? .english
  }
}

public enum ContentLabel: String, CaseIterable, Sendable {
  case sexualThemes = "sexual_themes"
  case drugsIntoxicationTobacco = "drugs_intoxication_tobacco"
  case gambling
  case violentGraphic = "violent_graphic"
  case profanity
  case matureRatedGames = "mature_rated_games"
  case politicsSensitive = "politics_sensitive"
}

public struct ContentPreferences: Equatable, Sendable {
  public static let blurToken = "blur_sexual_themes"

  public let hidden: Set<ContentLabel>
  public let blursSexualThemes: Bool

  public init(hidden: Set<ContentLabel>, blursSexualThemes: Bool) {
    self.hidden = hidden
    self.blursSexualThemes = blursSexualThemes
  }

  public var isBlurAvailable: Bool {
    !hidden.contains(.sexualThemes)
  }
}

public struct DevicePreferences: Equatable, Sendable {
  public let appearance: Appearance
  public let videoAutoplay: VideoAutoplay
  public let chatTextSize: ChatTextSize
  public let showsChatTimestamps: Bool
  public let liveLanguage: LiveLanguage
  public let content: ContentPreferences
  public let interests: Set<String>

  public init(
    appearance: Appearance,
    videoAutoplay: VideoAutoplay,
    chatTextSize: ChatTextSize,
    showsChatTimestamps: Bool,
    liveLanguage: LiveLanguage,
    content: ContentPreferences,
    interests: Set<String>
  ) {
    self.appearance = appearance
    self.videoAutoplay = videoAutoplay
    self.chatTextSize = chatTextSize
    self.showsChatTimestamps = showsChatTimestamps
    self.liveLanguage = liveLanguage
    self.content = content
    self.interests = interests
  }

  public static func defaults(language: LiveLanguage) -> DevicePreferences {
    DevicePreferences(
      appearance: .system,
      videoAutoplay: .wifiAndMobileData,
      chatTextSize: .medium,
      showsChatTimestamps: false,
      liveLanguage: language,
      content: ContentPreferences(hidden: [], blursSexualThemes: true),
      interests: []
    )
  }

  public func applying(_ update: PreferenceUpdate) -> DevicePreferences {
    DevicePreferences(
      appearance: update.appearance ?? appearance,
      videoAutoplay: update.videoAutoplay ?? videoAutoplay,
      chatTextSize: update.chatTextSize ?? chatTextSize,
      showsChatTimestamps: update.chatTimestamps ?? showsChatTimestamps,
      liveLanguage: update.liveLanguage ?? liveLanguage,
      content: update.content ?? content,
      interests: update.interests ?? interests
    )
  }

  public func update(for preference: Preference) -> PreferenceUpdate {
    switch preference {
    case .appearance: .appearance(appearance)
    case .videoAutoplay: .videoAutoplay(videoAutoplay)
    case .chatTextSize: .chatTextSize(chatTextSize)
    case .chatTimestamps: .chatTimestamps(showsChatTimestamps)
    case .liveLanguage: .liveLanguage(liveLanguage)
    case .contentFilters: .content(content)
    case .interests: .interests(interests)
    }
  }
}

public enum Preference: String, Sendable {
  case appearance
  case videoAutoplay = "video_autoplay"
  case chatTextSize = "chat_text_size"
  case chatTimestamps = "chat_timestamps"
  case liveLanguage = "live_language"
  case contentFilters = "content_filters"
  case interests
}

public enum PreferenceSource: String, Sendable {
  case onboarding
  case settings
}

public enum PreferenceUpdate: Equatable, Sendable {
  case appearance(Appearance)
  case videoAutoplay(VideoAutoplay)
  case chatTextSize(ChatTextSize)
  case chatTimestamps(Bool)
  case liveLanguage(LiveLanguage)
  case content(ContentPreferences)
  case interests(Set<String>)

  public var preference: Preference {
    switch self {
    case .appearance: .appearance
    case .videoAutoplay: .videoAutoplay
    case .chatTextSize: .chatTextSize
    case .chatTimestamps: .chatTimestamps
    case .liveLanguage: .liveLanguage
    case .content: .contentFilters
    case .interests: .interests
    }
  }

  public var value: String {
    switch self {
    case let .appearance(value): value.rawValue
    case let .videoAutoplay(value): value.rawValue
    case let .chatTextSize(value): value.rawValue
    case let .chatTimestamps(value): String(value)
    case let .liveLanguage(value): value.rawValue
    case let .content(value): Self.joined(value.hidden.map(\.rawValue) + (value.isBlurAvailable && value.blursSexualThemes ? [ContentPreferences.blurToken] : []))
    case let .interests(value): Self.joined(Array(value))
    }
  }

  private static func joined(_ values: [String]) -> String {
    values.sorted().joined(separator: ",")
  }

  var appearance: Appearance? {
    guard case let .appearance(value) = self else { return nil }
    return value
  }

  var videoAutoplay: VideoAutoplay? {
    guard case let .videoAutoplay(value) = self else { return nil }
    return value
  }

  var chatTextSize: ChatTextSize? {
    guard case let .chatTextSize(value) = self else { return nil }
    return value
  }

  var chatTimestamps: Bool? {
    guard case let .chatTimestamps(value) = self else { return nil }
    return value
  }

  var liveLanguage: LiveLanguage? {
    guard case let .liveLanguage(value) = self else { return nil }
    return value
  }

  var content: ContentPreferences? {
    guard case let .content(value) = self else { return nil }
    return value
  }

  var interests: Set<String>? {
    guard case let .interests(value) = self else { return nil }
    return value
  }
}

public struct PreferenceChanged: Equatable, Sendable {
  public let preference: Preference
  public let value: String
  public let source: PreferenceSource

  public init(preference: Preference, value: String, source: PreferenceSource) {
    self.preference = preference
    self.value = value
    self.source = source
  }
}

public protocol DevicePreferencesRepository: Sendable {
  func load() -> DevicePreferences
  func save(_ preferences: DevicePreferences)
  func completedOnboardingAccounts() -> Set<UUID>
  func saveCompletedOnboardingAccounts(_ accounts: Set<UUID>)
}
