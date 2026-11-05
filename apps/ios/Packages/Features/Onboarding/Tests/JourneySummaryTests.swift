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
      SummaryItem(title: "Live language", value: "Français"),
      SummaryItem(title: "Theme", value: "System"),
      SummaryItem(title: "Autoplay", value: "On Wi-Fi and mobile data"),
      SummaryItem(title: "Chat", value: "Medium"),
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
      SummaryItem(title: "Categories", value: "Fortnite, Art"),
      SummaryItem(title: "Interests", value: "Cozy, RPG"),
      SummaryItem(title: "Content", value: "2 labels hidden"),
      SummaryItem(title: "Live language", value: "Français"),
      SummaryItem(title: "Theme", value: "Dark"),
      SummaryItem(title: "Autoplay", value: "Never autoplay videos"),
      SummaryItem(title: "Notifications", value: "On"),
      SummaryItem(title: "Chat", value: "Large, with timestamps"),
    ])
  }

  @Test("des notifications refusées se disent Off ; non décidées, elles ne s'affichent pas")
  func notifications() {
    let denied = JourneySummary.items(followed: [], preferences: defaults, notifications: .denied)
    let undecided = JourneySummary.items(followed: [], preferences: defaults, notifications: .notDetermined)

    #expect(denied.contains(SummaryItem(title: "Notifications", value: "Off")))
    #expect(!undecided.map(\.title).contains("Notifications"))
  }

  @Test("un seul label masqué se dit au singulier")
  func singleLabel() {
    let preferences = defaults.applying(.content(ContentPreferences(hidden: [.gambling], blursSexualThemes: true)))

    #expect(JourneySummary.items(followed: [], preferences: preferences, notifications: nil).first == SummaryItem(title: "Content", value: "1 label hidden"))
  }
}
