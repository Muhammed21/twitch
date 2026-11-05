import Domain
import Foundation
import Onboarding
import Testing

@Suite("Textes du parcours, en anglais comme l'app de référence")
struct PersonalizationTextTests {
  @Test("l'intro invite à personnaliser, le récap lance le visionnage")
  func pages() {
    #expect(PersonalizationText.introTitle == "Make Twitch yours")
    #expect(PersonalizationText.introMessage == "Tell us what you like to watch. It takes a minute, and you can skip any step.")
    #expect(PersonalizationText.getStarted == "Get Started")
    #expect(PersonalizationText.summaryTitle == "You're all set to watch")
    #expect(PersonalizationText.summaryMessage == "You can change these choices anytime in Settings.")
    #expect(PersonalizationText.startWatching == "Start Watching")
  }

  @Test("l'en-tête propose Skip et annonce la page courante à VoiceOver")
  func header() {
    #expect(PersonalizationText.skip == "Skip")
    #expect(PersonalizationText.back == "Back")
    #expect(PersonalizationText.next == "Next")
    #expect(PersonalizationText.progress(page: 2, of: 10) == "Step 2 of 10")
  }

  @Test("la page 2 propose de suivre des catégories, avec leurs spectateurs")
  func categories() throws {
    #expect(PersonalizationText.categoriesTitle == "Pick categories you like")
    #expect(PersonalizationText.categoriesMessage == "We'll recommend live channels from the categories you follow.")
    #expect(PersonalizationText.categoriesEmpty == "No categories to show yet.")
    #expect(PersonalizationText.categoriesFailed == "Couldn't load categories.")
    #expect(PersonalizationText.followFailed == "Couldn't update this category. Tap it to try again.")
    #expect(PersonalizationText.retry == "Try Again")
    #expect(try PersonalizationText.viewers(ViewerCount(12400), locale: Locale(identifier: "en_US")) == "12K viewers")
    #expect(PersonalizationText.viewers(nil, locale: Locale(identifier: "en_US")) == nil)
  }

  @Test("la page 3 propose des centres d'intérêt")
  func interests() {
    #expect(PersonalizationText.interestsTitle == "What are you into?")
    #expect(PersonalizationText.interestsMessage == "Choose a few tags to tailor your recommendations.")
    #expect(PersonalizationText.interestsEmpty == "No tags to show yet.")
    #expect(PersonalizationText.interestsFailed == "Couldn't load tags.")
  }
}
