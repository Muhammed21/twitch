import Domain
import Foundation
import Onboarding
import Preferences
import SwiftUI
import Testing

@MainActor
private final class Changes {
  private(set) var all: [PreferenceChanged] = []

  func record(_ change: PreferenceChanged) {
    all.append(change)
  }
}

@MainActor
private func makeChoices(changes: Changes = Changes()) -> (SettingChoices, PreferencesStore) {
  let store = PreferencesStore(repository: InMemoryPreferences(language: .english), onChange: { changes.record($0) })
  return (SettingChoices(preferences: store), store)
}

@MainActor
@Suite("Pages 6, 7 et 9 : apparence, lecture auto et chat (ADR 0051 §4)")
struct SettingChoicesTests {
  @Test("par défaut, l'apparence suit le système, comme apparence--theme-systeme")
  func appearanceDefault() {
    let (choices, _) = makeChoices()

    #expect(choices.matchesSystem)
    #expect(!choices.isDark)
  }

  @Test("couper « Match System Theme » garde le thème affiché à ce moment", arguments: [true, false])
  func leaveSystem(isShowingDark: Bool) {
    let changes = Changes()
    let (choices, store) = makeChoices(changes: changes)

    choices.matchSystem(false, isShowingDark: isShowingDark)

    #expect(store.current.appearance == (isShowingDark ? .dark : .light))
    #expect(!choices.matchesSystem)
    #expect(choices.isDark == isShowingDark)
    #expect(changes.all.map(\.source) == [.onboarding])
  }

  @Test("« Dark Theme » force le sombre, puis le clair, et « Match System Theme » rend la main au système")
  func darkTheme() {
    let (choices, store) = makeChoices()
    choices.matchSystem(false, isShowingDark: false)

    choices.dark(true)
    #expect(store.current.appearance == .dark)
    choices.dark(false)
    #expect(store.current.appearance == .light)
    choices.matchSystem(true, isShowingDark: false)
    #expect(store.current.appearance == .system)
  }

  @Test("« Système » ne force aucun thème, « Sombre » et « Clair » le forcent")
  func colorScheme() {
    #expect(Appearance.system.colorScheme == nil)
    #expect(Appearance.dark.colorScheme == .dark)
    #expect(Appearance.light.colorScheme == .light)
  }

  @Test("la lecture auto part sur Wi-Fi et données mobiles, comme lecture-auto-videos--defaut ; la choisir l'enregistre")
  func autoplay() {
    let changes = Changes()
    let (choices, store) = makeChoices(changes: changes)
    #expect(choices.autoplay == .wifiAndMobileData)

    choices.choose(VideoAutoplay.never)

    #expect(store.current.videoAutoplay == .never)
    #expect(choices.autoplay == .never)
    #expect(changes.all == [PreferenceChanged(preference: .videoAutoplay, value: "never", source: .onboarding)])
  }

  @Test("le chat part en taille moyenne, sans horodatage")
  func chatDefaults() {
    let (choices, _) = makeChoices()

    #expect(choices.chatTextSize == .medium)
    #expect(!choices.showsTimestamps)
  }

  @Test("la taille du texte et l'horodatage du chat s'enregistrent")
  func chatWrites() {
    let changes = Changes()
    let (choices, store) = makeChoices(changes: changes)

    choices.choose(ChatTextSize.large)
    choices.showTimestamps(true)

    #expect(store.current.chatTextSize == .large)
    #expect(store.current.showsChatTimestamps)
    #expect(changes.all.map(\.preference) == [.chatTextSize, .chatTimestamps])
  }
}
