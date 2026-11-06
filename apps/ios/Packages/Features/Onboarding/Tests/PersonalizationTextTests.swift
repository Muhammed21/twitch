import Domain
import Foundation
import Onboarding
import Testing

@Suite("Textes du parcours, en anglais et en français")
struct PersonalizationTextTests {
  @Test("l'intro invite à personnaliser, le récap lance le visionnage")
  func pages() {
    #expect(PersonalizationText.introTitle == shown(english: "Make Twitch yours", french: "Faites de Twitch votre univers"))
    #expect(PersonalizationText.introMessage == shown(english: "Tell us what you like to watch. It takes a minute, and you can skip any step.", french: "Dites-nous ce que vous aimez regarder. Ça prend une minute, et vous pouvez passer chaque étape."))
    #expect(PersonalizationText.getStarted == shown(english: "Get Started", french: "C'est parti"))
    #expect(PersonalizationText.summaryTitle == shown(english: "You're all set to watch", french: "Vous êtes prêt à regarder"))
    #expect(PersonalizationText.summaryMessage == shown(english: "You can change these choices anytime in Settings.", french: "Vous pouvez modifier ces choix à tout moment dans Paramètres."))
    #expect(PersonalizationText.startWatching == shown(english: "Start Watching", french: "Commencer à regarder"))
  }

  @Test("l'en-tête propose Skip et annonce la page courante à VoiceOver")
  func header() {
    #expect(PersonalizationText.skip == shown(english: "Skip", french: "Passer"))
    #expect(PersonalizationText.back == shown(english: "Back", french: "Retour"))
    #expect(PersonalizationText.next == shown(english: "Next", french: "Suivant"))
    #expect(PersonalizationText.progress(page: 2, of: 10) == shown(english: "Step 2 of 10", french: "Étape 2 sur 10"))
  }

  @Test("la page 2 propose de suivre des catégories, avec leurs spectateurs")
  func categories() throws {
    #expect(PersonalizationText.categoriesTitle == shown(english: "Pick categories you like", french: "Choisissez des catégories qui vous plaisent"))
    #expect(PersonalizationText.categoriesMessage == shown(english: "We'll recommend live channels from the categories you follow.", french: "Nous vous recommanderons des chaînes live des catégories que vous suivez."))
    #expect(PersonalizationText.categoriesEmpty == shown(english: "No categories to show yet.", french: "Aucune catégorie à afficher pour le moment."))
    #expect(PersonalizationText.categoriesFailed == shown(english: "Couldn't load categories.", french: "Impossible de charger les catégories."))
    #expect(PersonalizationText.followFailed == shown(english: "Couldn't update this category. Tap it to try again.", french: "Impossible de mettre à jour cette catégorie. Touchez-la pour réessayer."))
    #expect(PersonalizationText.retry == shown(english: "Try Again", french: "Réessayer"))
    #expect(try PersonalizationText.viewers(ViewerCount(12400), locale: Locale(identifier: "en_US")) == shown(english: "12K viewers", french: "12K spectateurs"))
    #expect(PersonalizationText.viewers(nil, locale: Locale(identifier: "en_US")) == nil)
    #expect(
      try PersonalizationText.viewers(ViewerCount(1), locale: Locale(identifier: "en_US"))
        == shown(english: "1 viewer", french: "1 spectateur")
    )
  }

  @Test("la page 3 propose des centres d'intérêt")
  func interests() {
    #expect(PersonalizationText.interestsTitle == shown(english: "What are you into?", french: "Qu'est-ce qui vous intéresse\u{00A0}?"))
    #expect(PersonalizationText.interestsMessage == shown(english: "Choose a few tags to tailor your recommendations.", french: "Choisissez quelques tags pour affiner vos recommandations."))
    #expect(PersonalizationText.interestsEmpty == shown(english: "No tags to show yet.", french: "Aucun tag à afficher pour le moment."))
    #expect(PersonalizationText.interestsFailed == shown(english: "Couldn't load tags.", french: "Impossible de charger les tags."))
  }

  @Test("la page 4 reprend les libellés et les notes de preferences-contenu--defaut")
  func content() {
    #expect(PersonalizationText.contentTitle == shown(english: "Choose what you see", french: "Choisissez ce que vous voyez"))
    #expect(PersonalizationText.contentMessage == shown(english: "Hide content you'd rather not come across. You can change this later in Settings.", french: "Masquez les contenus que vous préférez ne pas voir. Vous pourrez changer cela plus tard dans Paramètres."))
    #expect(PersonalizationText.contentSection == shown(english: "Content Display Preferences", french: "Préférences d'affichage du contenu"))
    #expect(PersonalizationText.contentFooter == shown(english: "Control how content labeled with Content Classification Labels is displayed across Twitch. Content from channels you follow will still be shown", french: "Contrôlez l'affichage sur Twitch des contenus signalés par des étiquettes de classification de contenu. Les contenus des chaînes que vous suivez resteront affichés"))
    #expect(PersonalizationText.blurTitle == shown(english: "Blur Sexual Themes", french: "Flouter les thèmes sexuels"))
    #expect(PersonalizationText.blurFooter == shown(english: "Blur preview thumbnails for content labeled as including \"Sexual Themes\"", french: "Floute les miniatures d'aperçu des contenus signalés comme comportant des « Thèmes sexuels »"))
    #expect(ContentLabel.allCases.map(PersonalizationText.hide) == [
      shown(english: "Hide Sexual Themes", french: "Masquer Thèmes sexuels"),
      shown(english: "Hide Drugs, Intoxication, or Excessive Tobacco Use", french: "Masquer Drogues, intoxication ou consommation excessive de tabac"),
      shown(english: "Hide Gambling", french: "Masquer Jeux d'argent"),
      shown(english: "Hide Violent and Graphic Depictions", french: "Masquer Représentations violentes et explicites"),
      shown(english: "Hide Significant Profanity or Vulgarity", french: "Masquer Grossièretés ou vulgarité importantes"),
      shown(english: "Hide Mature-Rated Games", french: "Masquer Jeux pour adultes"),
      shown(english: "Hide Politics and Sensitive Social Issues", french: "Masquer Politique et questions sociales sensibles"),
    ])
  }

  @Test("la page 5 nomme chaque langue dans sa propre langue, quelle que soit celle de l'appareil")
  func language() {
    #expect(PersonalizationText.languageTitle == shown(english: "Which language do you watch in?", french: "Dans quelle langue regardez-vous\u{00A0}?"))
    #expect(PersonalizationText.languageMessage == shown(english: "We'll favor live channels in this language.", french: "Nous privilégierons les chaînes live dans cette langue."))
    #expect(PersonalizationText.languageName(.french) == "Français")
    #expect(PersonalizationText.languageName(.german) == "Deutsch")
    #expect(PersonalizationText.languageName(.japanese) == "日本語")
    #expect(PersonalizationText.languageName(.english) == "English")
  }

  @Test("la page 6 reprend les libellés de apparence--theme-systeme et --theme-manuel")
  func appearance() {
    #expect(PersonalizationText.appearanceTitle == shown(english: "Pick your theme", french: "Choisissez votre thème"))
    #expect(PersonalizationText.appearanceMessage == shown(english: "Match your device, or choose a theme just for Twitch.", french: "Suivez le réglage de votre appareil ou choisissez un thème rien que pour Twitch."))
    #expect(PersonalizationText.themeSection == shown(english: "Theme", french: "Thème"))
    #expect(PersonalizationText.matchSystemTheme == shown(english: "Match System Theme", french: "Utiliser le thème du système"))
    #expect(PersonalizationText.darkTheme == shown(english: "Dark Theme", french: "Thème sombre"))
  }

  @Test("la page 7 reprend les choix de lecture-auto-videos--defaut")
  func autoplay() {
    #expect(PersonalizationText.autoplayTitle == shown(english: "Autoplay Videos", french: "Lecture automatique des vidéos"))
    #expect(PersonalizationText.autoplayMessage == shown(english: "Choose when live videos can start playing on their own.", french: "Choisissez quand les vidéos live peuvent démarrer toutes seules."))
    #expect(VideoAutoplay.allCases.map(PersonalizationText.autoplay) == [
      shown(english: "On Wi-Fi and mobile data", french: "En Wi-Fi et en données mobiles"),
      shown(english: "On Wi-Fi only", french: "En Wi-Fi uniquement"),
      shown(english: "Never autoplay videos", french: "Ne jamais lire automatiquement les vidéos"),
    ])
  }

  @Test("la page 8 reprend les boutons et la note de permission-notifications--defaut")
  func notifications() {
    #expect(PersonalizationText.notificationsTitle == shown(english: "Never miss your favorite stream!", french: "Ne manquez plus jamais votre stream préféré\u{00A0}!"))
    #expect(PersonalizationText.turnOnNotifications == shown(english: "Turn on Notifications", french: "Activer les notifications"))
    #expect(PersonalizationText.remindMeLater == shown(english: "Remind me later", french: "Me le rappeler plus tard"))
    #expect(PersonalizationText.notificationsFooter == shown(english: "You can change this anytime in the iOS Settings.", french: "Vous pouvez changer cela à tout moment dans les Réglages d'iOS."))
  }

  @Test("la page 9 règle la taille du texte et l'horodatage du chat")
  func chat() {
    #expect(PersonalizationText.chatTitle == shown(english: "Set up your chat", french: "Configurez votre chat"))
    #expect(PersonalizationText.chatMessage == shown(english: "Pick a text size, and whether each message shows when it was sent.", french: "Choisissez une taille de texte, et si chaque message affiche son heure d'envoi."))
    #expect(PersonalizationText.chatTextSizeSection == shown(english: "Text Size", french: "Taille du texte"))
    #expect(ChatTextSize.allCases.map(PersonalizationText.chatTextSize) == [shown(english: "Small", french: "Petite"), shown(english: "Medium", french: "Moyenne"), shown(english: "Large", french: "Grande")])
    #expect(PersonalizationText.chatTimestamps == shown(english: "Show Timestamps", french: "Afficher l'horodatage"))
  }
}
