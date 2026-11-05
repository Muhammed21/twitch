import Domain
import Foundation
import Preferences
import Testing

private func makeSuite() -> String {
  "preferences.tests.\(UUID().uuidString)"
}

@MainActor
private final class ChangeRecorder {
  private(set) var changes: [PreferenceChanged] = []

  func record(_ change: PreferenceChanged) {
    changes.append(change)
  }
}

@MainActor
private func makeStore(
  suite: String,
  language: LiveLanguage = .english,
  recorder: ChangeRecorder = ChangeRecorder()
) -> PreferencesStore {
  PreferencesStore(
    repository: UserDefaultsPreferences(suiteName: suite, language: language),
    onChange: { recorder.record($0) }
  )
}

@MainActor
@Suite("Préférences de l'appareil sur UserDefaults (ADR 0051, §4)")
struct PreferencesStoreTests {
  @Test("une valeur absente rend le défaut de la référence")
  func absentGivesDefaults() {
    let store = makeStore(suite: makeSuite(), language: .french)

    #expect(store.current == DevicePreferences.defaults(language: .french))
  }

  @Test("une valeur écrite se relit après recréation du store")
  func persists() {
    let suite = makeSuite()
    let store = makeStore(suite: suite)
    let content = ContentPreferences(hidden: [.gambling, .profanity], blursSexualThemes: false)

    store.update(.appearance(.dark), source: .onboarding)
    store.update(.videoAutoplay(.wifiOnly), source: .onboarding)
    store.update(.chatTextSize(.large), source: .onboarding)
    store.update(.chatTimestamps(true), source: .onboarding)
    store.update(.liveLanguage(.japanese), source: .onboarding)
    store.update(.content(content), source: .onboarding)
    store.update(.interests(["FPS", "Chill"]), source: .onboarding)

    let reread = makeStore(suite: suite).current
    #expect(reread.appearance == .dark)
    #expect(reread.videoAutoplay == .wifiOnly)
    #expect(reread.chatTextSize == .large)
    #expect(reread.showsChatTimestamps)
    #expect(reread.liveLanguage == .japanese)
    #expect(reread.content == content)
    #expect(reread.interests == ["FPS", "Chill"])
  }

  @Test("une valeur inconnue sur le disque rend le défaut, sans planter")
  func unknownStoredValue() {
    let suite = makeSuite()
    let disk = UserDefaults(suiteName: suite)
    disk?.set("sepia", forKey: "preferences.appearance")
    disk?.set("tlh", forKey: "preferences.liveLanguage")

    let store = makeStore(suite: suite, language: .german)

    #expect(store.current.appearance == .system)
    #expect(store.current.liveLanguage == .german)
  }

  @Test("un changement émet un seul preference:changed avec sa source")
  func emitsOnce() {
    let recorder = ChangeRecorder()
    let store = makeStore(suite: makeSuite(), recorder: recorder)

    store.update(.appearance(.light), source: .settings)

    #expect(recorder.changes == [PreferenceChanged(preference: .appearance, value: "light", source: .settings)])
  }

  @Test("une valeur identique n'émet rien")
  func identicalIsSilent() {
    let recorder = ChangeRecorder()
    let store = makeStore(suite: makeSuite(), recorder: recorder)

    store.update(.appearance(.system), source: .onboarding)
    store.update(.chatTimestamps(true), source: .onboarding)
    store.update(.chatTimestamps(true), source: .onboarding)

    #expect(recorder.changes == [PreferenceChanged(preference: .chatTimestamps, value: "true", source: .onboarding)])
  }

  @Test("« parcours terminé » est propre à un ID de compte, et survit à la recréation du store")
  func onboardingPerAccount() {
    let suite = makeSuite()
    let finished = UUID()
    let other = UUID()
    let store = makeStore(suite: suite)

    #expect(!store.hasCompletedOnboarding(finished))
    store.completeOnboarding(finished)

    let reread = makeStore(suite: suite)
    #expect(reread.hasCompletedOnboarding(finished))
    #expect(!reread.hasCompletedOnboarding(other))
  }

  @Test("terminer le parcours n'émet aucun preference:changed")
  func onboardingIsNotAPreference() {
    let recorder = ChangeRecorder()
    let store = makeStore(suite: makeSuite(), recorder: recorder)

    store.completeOnboarding(UUID())

    #expect(recorder.changes.isEmpty)
  }
}

@MainActor
@Suite("Préférences en mémoire, pour les previews et les tests des features")
struct InMemoryPreferencesTests {
  @Test("part des défauts et garde ce qu'on y écrit, d'un store à l'autre")
  func keeps() {
    let repository = InMemoryPreferences(language: .english)
    let account = UUID()
    let store = PreferencesStore(repository: repository, onChange: { _ in })

    store.update(.appearance(.dark), source: .onboarding)
    store.completeOnboarding(account)

    let reread = PreferencesStore(repository: repository, onChange: { _ in })
    #expect(reread.current == DevicePreferences.defaults(language: .english).applying(.appearance(.dark)))
    #expect(reread.hasCompletedOnboarding(account))
  }
}
