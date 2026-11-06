import Domain

public extension PreferencesStore {
  convenience init(repository: any DevicePreferencesRepository, analytics: any Analytics) {
    self.init(repository: repository) { change in
      guard let event = change.analyticsEvent else { return }
      analytics.capture(event)
    }
  }
}

extension PreferenceChanged {
  var analyticsEvent: AnalyticsEvent? {
    guard !value.isEmpty else { return nil }
    return .preferenceChanged(preference: preference.analytics, value: value, source: source.analytics)
  }
}

extension Preference {
  var analytics: AnalyticsPreference {
    switch self {
    case .appearance: .appearance
    case .videoAutoplay: .videoAutoplay
    case .chatTextSize: .chatTextSize
    case .chatTimestamps: .chatTimestamps
    case .liveLanguage: .liveLanguage
    case .contentFilters: .contentFilters
    case .interests: .interests
    }
  }
}

extension PreferenceSource {
  var analytics: AnalyticsSource {
    switch self {
    case .onboarding: .onboarding
    case .settings: .settings
    }
  }
}
