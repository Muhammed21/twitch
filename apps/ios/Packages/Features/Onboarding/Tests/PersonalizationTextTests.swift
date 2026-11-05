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

  @Test("la page 4 reprend les libellés et les notes de preferences-contenu--defaut")
  func content() {
    #expect(PersonalizationText.contentTitle == "Choose what you see")
    #expect(PersonalizationText.contentMessage == "Hide content you'd rather not come across. You can change this later in Settings.")
    #expect(PersonalizationText.contentSection == "Content Display Preferences")
    #expect(PersonalizationText.contentFooter == "Control how content labeled with Content Classification Labels is displayed across Twitch. Content from channels you follow will still be shown")
    #expect(PersonalizationText.blurTitle == "Blur Sexual Themes")
    #expect(PersonalizationText.blurFooter == "Blur preview thumbnails for content labeled as including \"Sexual Themes\"")
    #expect(ContentLabel.allCases.map(PersonalizationText.hide) == [
      "Hide Sexual Themes",
      "Hide Drugs, Intoxication, or Excessive Tobacco Use",
      "Hide Gambling",
      "Hide Violent and Graphic Depictions",
      "Hide Significant Profanity or Vulgarity",
      "Hide Mature-Rated Games",
      "Hide Politics and Sensitive Social Issues",
    ])
  }

  @Test("la page 5 nomme chaque langue dans sa propre langue, quelle que soit celle de l'appareil")
  func language() {
    #expect(PersonalizationText.languageTitle == "Which language do you watch in?")
    #expect(PersonalizationText.languageMessage == "We'll favor live channels in this language.")
    #expect(PersonalizationText.languageName(.french) == "Français")
    #expect(PersonalizationText.languageName(.german) == "Deutsch")
    #expect(PersonalizationText.languageName(.japanese) == "日本語")
    #expect(PersonalizationText.languageName(.english) == "English")
  }
}
