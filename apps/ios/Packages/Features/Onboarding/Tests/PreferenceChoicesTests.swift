import Domain
import Foundation
import Onboarding
import Preferences
import Testing

@MainActor
private final class Changes {
  private(set) var all: [PreferenceChanged] = []

  func record(_ change: PreferenceChanged) {
    all.append(change)
  }
}

@MainActor
private func makeChoices(changes: Changes = Changes()) -> (PreferenceChoices, PreferencesStore) {
  let store = PreferencesStore(repository: InMemoryPreferences(language: .french), onChange: { changes.record($0) })
  return (PreferenceChoices(preferences: store), store)
}

@MainActor
@Suite("Pages 4 et 5 : préférences de contenu et langue des lives (ADR 0051 §4)")
struct PreferenceChoicesTests {
  @Test("par défaut, rien n'est masqué et « Blur Sexual Themes » est activé, comme preferences-contenu--defaut")
  func defaults() {
    let (choices, _) = makeChoices()

    #expect(ContentLabel.allCases.allSatisfy { !choices.isHidden($0) })
    #expect(choices.isBlurring)
    #expect(choices.isBlurAvailable)
    #expect(choices.contentSelectionCount == 0)
  }

  @Test("chaque interrupteur écrit son filtre tout de suite, avec la source onboarding", arguments: ContentLabel.allCases)
  func hideWrites(label: ContentLabel) {
    let changes = Changes()
    let (choices, store) = makeChoices(changes: changes)

    choices.hide(label, true)

    #expect(store.current.content.hidden == [label])
    #expect(choices.isHidden(label))
    #expect(changes.all.map(\.source) == [.onboarding])
    #expect(changes.all.map(\.preference) == [.contentFilters])
  }

  @Test("rouvrir un filtre le retire, et selection_count compte les filtres actifs")
  func unhide() {
    let (choices, store) = makeChoices()

    choices.hide(.gambling, true)
    choices.hide(.profanity, true)
    #expect(choices.contentSelectionCount == 2)
    choices.hide(.gambling, false)

    #expect(store.current.content.hidden == [.profanity])
    #expect(choices.contentSelectionCount == 1)
  }

  @Test("masquer les thèmes sexuels grise « Blur Sexual Themes », comme preferences-contenu--filtres-actives")
  func blurUnavailable() {
    let (choices, _) = makeChoices()

    choices.hide(.sexualThemes, true)

    #expect(!choices.isBlurAvailable)
  }

  @Test("« Blur Sexual Themes » écrit son réglage")
  func blurWrites() {
    let (choices, store) = makeChoices()

    choices.blur(false)

    #expect(!store.current.content.blursSexualThemes)
    #expect(!choices.isBlurring)
  }

  @Test("la langue des lives part de celle de l'appareil ; la choisir l'enregistre")
  func language() {
    let changes = Changes()
    let (choices, store) = makeChoices(changes: changes)
    #expect(choices.language == .french)

    choices.choose(.japanese)

    #expect(store.current.liveLanguage == .japanese)
    #expect(choices.language == .japanese)
    #expect(changes.all == [PreferenceChanged(preference: .liveLanguage, value: "ja", source: .onboarding)])
  }
}
