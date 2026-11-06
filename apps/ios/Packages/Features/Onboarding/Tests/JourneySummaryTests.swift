import Domain
import Onboarding
import Testing

private let defaults = DevicePreferences.defaults(language: .french)

@Suite("Page 10 : le récap liste les choix faits (ADR 0051 §1 et §6)")
struct JourneySummaryTests {
  @Test("sans choix, le récap garde les réglages toujours posés : langue, thème, lecture auto et chat")
  func nothingChosen() {
    let items = JourneySummary.items(followed: [], preferences: defaults, notifications: nil)

    #expect(items == [
      SummaryItem(title: shown(english: "Live language", french: "Langue des lives"), value: "Français"),
      SummaryItem(title: shown(english: "Theme", french: "Thème"), value: shown(english: "System", french: "Système")),
      SummaryItem(title: shown(english: "Autoplay", french: "Lecture automatique"), value: shown(english: "On Wi-Fi and mobile data", french: "En Wi-Fi et en données mobiles")),
      SummaryItem(title: "Chat", value: shown(english: "Medium", french: "Moyenne")),
    ])
  }

  @Test("chaque choix fait apparaît, dans l'ordre des pages")
  func everythingChosen() {
    let preferences = defaults
      .applying(.interests(["RPG", "Cozy"]))
      .applying(.content(ContentPreferences(hidden: [.gambling, .profanity], blursSexualThemes: true)))
      .applying(.appearance(.dark))
      .applying(.videoAutoplay(.never))
      .applying(.chatTextSize(.large))
      .applying(.chatTimestamps(true))

    let items = JourneySummary.items(followed: ["Fortnite", "Art"], preferences: preferences, notifications: .granted)

    #expect(items == [
      SummaryItem(title: shown(english: "Categories", french: "Catégories"), value: "Fortnite, Art"),
      SummaryItem(title: shown(english: "Interests", french: "Centres d'intérêt"), value: "Cozy, RPG"),
      SummaryItem(title: shown(english: "Content", french: "Contenu"), value: shown(english: "2 labels hidden", french: "2 étiquettes masquées")),
      SummaryItem(title: shown(english: "Live language", french: "Langue des lives"), value: "Français"),
      SummaryItem(title: shown(english: "Theme", french: "Thème"), value: shown(english: "Dark", french: "Sombre")),
      SummaryItem(title: shown(english: "Autoplay", french: "Lecture automatique"), value: shown(english: "Never autoplay videos", french: "Ne jamais lire automatiquement les vidéos")),
      SummaryItem(title: "Notifications", value: shown(english: "On", french: "Activé")),
      SummaryItem(title: "Chat", value: shown(english: "Large, with timestamps", french: "Grande, avec horodatage")),
    ])
  }

  @Test("des notifications refusées se disent Off ; non décidées, elles ne s'affichent pas")
  func notifications() {
    let denied = JourneySummary.items(followed: [], preferences: defaults, notifications: .denied)
    let undecided = JourneySummary.items(followed: [], preferences: defaults, notifications: .notDetermined)

    #expect(denied.contains(SummaryItem(title: "Notifications", value: shown(english: "Off", french: "Désactivé"))))
    #expect(!undecided.map(\.title).contains("Notifications"))
  }

  @Test("un seul label masqué se dit au singulier")
  func singleLabel() {
    let preferences = defaults.applying(.content(ContentPreferences(hidden: [.gambling], blursSexualThemes: true)))

    #expect(JourneySummary.items(followed: [], preferences: preferences, notifications: nil).first == SummaryItem(title: shown(english: "Content", french: "Contenu"), value: shown(english: "1 label hidden", french: "1 étiquette masquée")))
  }
}
