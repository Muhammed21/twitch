import DesignSystem
import Domain
import Foundation
import Onboarding
import Preferences
import Testing

@MainActor
private func makeChoices() -> SettingChoices {
  SettingChoices(preferences: PreferencesStore(repository: InMemoryPreferences(language: .english), onChange: { _ in }))
}

@MainActor
@Suite("Aperçu du chat sur la page 9 du parcours")
struct ChatPreviewTests {
  @Test("par défaut, l'aperçu est en taille moyenne et sans horodatage, comme le chat")
  func defaultStyle() {
    #expect(makeChoices().chatPreviewStyle == ChatLineStyle(scale: .medium, showsTimestamps: false))
  }

  @Test(
    "l'aperçu prend aussitôt la taille choisie",
    arguments: [(ChatTextSize.small, ChatTextScale.small), (.medium, .medium), (.large, .large)]
  )
  func size(size: ChatTextSize, scale: ChatTextScale) {
    let choices = makeChoices()

    choices.choose(size)

    #expect(choices.chatPreviewStyle == ChatLineStyle(scale: scale, showsTimestamps: false))
  }

  @Test("l'aperçu montre l'heure dès que l'horodatage est activé, et la retire quand il est coupé")
  func timestamps() {
    let choices = makeChoices()

    choices.showTimestamps(true)
    #expect(choices.chatPreviewStyle.showsTimestamps)

    choices.showTimestamps(false)
    #expect(!choices.chatPreviewStyle.showsTimestamps)
  }

  @Test("l'aperçu montre trois messages d'exemple, chacun avec son pseudo et son heure")
  func lines() {
    let lines = ChatPreview.lines(locale: english)

    #expect(lines.map(\.author) == ["nightowl_tv:", "pixel_pam:", "lunarfox:"])
    #expect(lines.map(\.body) == ["That clutch was unreal!", "GG, see you next stream", "This text size is easy to read"])
    #expect(lines.map(\.time) == ["21:04", "21:04", "21:05"])
  }

  @Test("en français, les messages d'exemple sont traduits ; pseudos et heures ne changent pas")
  func linesInFrench() {
    let lines = ChatPreview.lines(locale: french)

    #expect(lines.map(\.body) == ["Ce clutch était irréel !", "GG, à la prochaine !", "Cette taille de texte se lit bien"])
    #expect(lines.map(\.author) == ChatPreview.lines(locale: english).map(\.author))
    #expect(lines.map(\.time) == ChatPreview.lines(locale: english).map(\.time))
  }

  @Test("chaque pseudo a sa couleur de la palette, et un seul porte le badge Turbo")
  func colorsAndBadge() {
    let lines = ChatPreview.lines(locale: english)

    #expect(lines.map(\.nameColor) == [.purple, .teal, .green])
    #expect(lines.map(\.badges) == [[.turboBattery], [], []])
  }

  @Test("l'aperçu s'annonce sous le libellé Preview, Aperçu en français")
  func label() {
    #expect(ChatPreview.label(locale: english) == "Preview")
    #expect(ChatPreview.label(locale: french) == "Aperçu")
  }
}

private let english = Locale(identifier: "en_US")
private let french = Locale(identifier: "fr_FR")
