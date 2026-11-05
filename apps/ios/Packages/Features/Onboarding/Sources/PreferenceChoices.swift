import Domain
import Preferences

@MainActor
public struct PreferenceChoices {
  private let preferences: PreferencesStore

  public init(preferences: PreferencesStore) {
    self.preferences = preferences
  }

  private var content: ContentPreferences {
    preferences.current.content
  }

  public var isBlurring: Bool {
    content.blursSexualThemes
  }

  public var isBlurAvailable: Bool {
    content.isBlurAvailable
  }

  public var contentSelectionCount: Int {
    content.hidden.count
  }

  public var language: LiveLanguage {
    preferences.current.liveLanguage
  }

  public func isHidden(_ label: ContentLabel) -> Bool {
    content.hidden.contains(label)
  }

  public func hide(_ label: ContentLabel, _ isHidden: Bool) {
    let hidden = isHidden ? content.hidden.union([label]) : content.hidden.subtracting([label])
    preferences.update(.content(ContentPreferences(hidden: hidden, blursSexualThemes: content.blursSexualThemes)), source: .onboarding)
  }

  public func blur(_ isBlurring: Bool) {
    preferences.update(.content(ContentPreferences(hidden: content.hidden, blursSexualThemes: isBlurring)), source: .onboarding)
  }

  public func choose(_ language: LiveLanguage) {
    preferences.update(.liveLanguage(language), source: .onboarding)
  }
}
