import Domain
import Foundation

public struct UserDefaultsPreferences: DevicePreferencesRepository {
  private enum Key {
    static let appearance = "preferences.appearance"
    static let videoAutoplay = "preferences.videoAutoplay"
    static let chatTextSize = "preferences.chatTextSize"
    static let chatTimestamps = "preferences.chatTimestamps"
    static let liveLanguage = "preferences.liveLanguage"
    static let hiddenContent = "preferences.hiddenContent"
    static let blursSexualThemes = "preferences.blursSexualThemes"
    static let interests = "preferences.interests"
    static let completedOnboarding = "onboarding.completedAccounts"
  }

  private let suiteName: String?
  private let language: LiveLanguage

  public init(suiteName: String?, language: LiveLanguage) {
    self.suiteName = suiteName
    self.language = language
  }

  private var defaults: UserDefaults {
    UserDefaults(suiteName: suiteName) ?? .standard
  }

  public func load() -> DevicePreferences {
    let fallback = DevicePreferences.defaults(language: language)
    return DevicePreferences(
      appearance: raw(Key.appearance) ?? fallback.appearance,
      videoAutoplay: raw(Key.videoAutoplay) ?? fallback.videoAutoplay,
      chatTextSize: raw(Key.chatTextSize) ?? fallback.chatTextSize,
      showsChatTimestamps: bool(Key.chatTimestamps) ?? fallback.showsChatTimestamps,
      liveLanguage: raw(Key.liveLanguage) ?? fallback.liveLanguage,
      content: ContentPreferences(
        hidden: Set(strings(Key.hiddenContent)?.compactMap(ContentLabel.init(rawValue:)) ?? []),
        blursSexualThemes: bool(Key.blursSexualThemes) ?? fallback.content.blursSexualThemes
      ),
      interests: Set(strings(Key.interests) ?? [])
    )
  }

  public func save(_ preferences: DevicePreferences) {
    let defaults = defaults
    defaults.set(preferences.appearance.rawValue, forKey: Key.appearance)
    defaults.set(preferences.videoAutoplay.rawValue, forKey: Key.videoAutoplay)
    defaults.set(preferences.chatTextSize.rawValue, forKey: Key.chatTextSize)
    defaults.set(preferences.showsChatTimestamps, forKey: Key.chatTimestamps)
    defaults.set(preferences.liveLanguage.rawValue, forKey: Key.liveLanguage)
    defaults.set(preferences.content.hidden.map(\.rawValue).sorted(), forKey: Key.hiddenContent)
    defaults.set(preferences.content.blursSexualThemes, forKey: Key.blursSexualThemes)
    defaults.set(preferences.interests.sorted(), forKey: Key.interests)
  }

  public func completedOnboardingAccounts() -> Set<UUID> {
    Set(strings(Key.completedOnboarding)?.compactMap(UUID.init(uuidString:)) ?? [])
  }

  public func saveCompletedOnboardingAccounts(_ accounts: Set<UUID>) {
    defaults.set(accounts.map(\.uuidString).sorted(), forKey: Key.completedOnboarding)
  }

  private func raw<Value: RawRepresentable>(_ key: String) -> Value? where Value.RawValue == String {
    defaults.string(forKey: key).flatMap(Value.init(rawValue:))
  }

  private func bool(_ key: String) -> Bool? {
    defaults.object(forKey: key) as? Bool
  }

  private func strings(_ key: String) -> [String]? {
    defaults.stringArray(forKey: key)
  }
}
