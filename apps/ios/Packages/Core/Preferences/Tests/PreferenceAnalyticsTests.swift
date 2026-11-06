import AnalyticsTesting
import Domain
import Preferences
import Testing

@MainActor
private func makeStore(analytics: RecordingAnalytics) -> PreferencesStore {
  PreferencesStore(repository: InMemoryPreferences(language: .english), analytics: analytics)
}

@MainActor
@Suite("Préférences de l'appareil : événement preference:changed (ADR 0051, §7)")
struct PreferenceAnalyticsTests {
  @Test("un réglage changé émet preference:changed avec sa valeur fermée et sa source", arguments: [
    (PreferenceUpdate.appearance(.dark), PreferenceSource.onboarding, AnalyticsEvent.preferenceChanged(preference: .appearance, value: "dark", source: .onboarding)),
    (.videoAutoplay(.wifiOnly), .settings, .preferenceChanged(preference: .videoAutoplay, value: "wifi_only", source: .settings)),
    (.chatTextSize(.large), .onboarding, .preferenceChanged(preference: .chatTextSize, value: "large", source: .onboarding)),
    (.chatTimestamps(true), .onboarding, .preferenceChanged(preference: .chatTimestamps, value: "true", source: .onboarding)),
    (.liveLanguage(.french), .onboarding, .preferenceChanged(preference: .liveLanguage, value: "fr", source: .onboarding)),
    (
      .content(ContentPreferences(hidden: [.gambling], blursSexualThemes: true)), .onboarding,
      .preferenceChanged(preference: .contentFilters, value: "blur_sexual_themes,gambling", source: .onboarding)
    ),
    (.interests(["fps", "rpg"]), .onboarding, .preferenceChanged(preference: .interests, value: "fps,rpg", source: .onboarding)),
  ])
  func changed(update: PreferenceUpdate, source: PreferenceSource, expected: AnalyticsEvent) {
    let analytics = RecordingAnalytics()
    let store = makeStore(analytics: analytics)

    store.update(update, source: source)

    #expect(analytics.captured == [expected])
  }

  @Test("une valeur identique n'émet rien")
  func unchanged() {
    let analytics = RecordingAnalytics()
    let store = makeStore(analytics: analytics)

    store.update(.appearance(.system), source: .onboarding)

    #expect(analytics.captured.isEmpty)
  }

  @Test("une liste vidée n'émet rien : le schéma refuse une valeur vide")
  func emptied() {
    let analytics = RecordingAnalytics()
    let store = makeStore(analytics: analytics)
    store.update(.interests(["fps"]), source: .onboarding)

    store.update(.interests([]), source: .onboarding)

    #expect(analytics.captured == [.preferenceChanged(preference: .interests, value: "fps", source: .onboarding)])
    #expect(store.current.interests.isEmpty)
  }
}
