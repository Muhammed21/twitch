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
}
