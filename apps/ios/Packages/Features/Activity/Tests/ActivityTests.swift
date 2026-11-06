import Activity
import Testing

@Suite("Page Activité, mode spectateur (IMG_9612, IMG_9613)")
struct ActivityTests {
  @Test("l'onglet de la barre du bas et le titre de la page s'appellent Activité")
  func title() {
    #expect(english(ActivityText.title) == "Activity")
    #expect(french(ActivityText.title) == "Activité")
  }

  @Test("la page s'ouvre sur Notifications, suivi de Chuchotements")
  func tabs() {
    #expect(ActivityTab.allCases == [.notifications, .whispers])
    #expect(ActivityTab.initial == .notifications)
    #expect(ActivityTab.allCases.map { french($0.title) } == ["Notifications", "Chuchotements"])
    #expect(ActivityTab.allCases.map { english($0.title) } == ["Notifications", "Whispers"])
    #expect(ActivityTab.allCases.map(\.accessibilityIdentifier) == [
      "activity.tab.notifications", "activity.tab.whispers",
    ])
  }

  @Test("Notifications, vide : le message de l'état vide de docs/reference-ui, sans bouton")
  func notificationsEmpty() {
    let empty = ActivityTab.notifications.empty

    #expect(english(empty.title) == "You’re all caught up. What a pro!")
    #expect(english(empty.message) == "You have no messages.")
    #expect(french(empty.title) == "Vous êtes à jour. Quel pro !")
    #expect(french(empty.message) == "Vous n'avez aucun message.")
    #expect(empty.action == nil)
  }

  @Test("Chuchotements, vide : le texte de IMG_9613 et « Commencer une conversation », désactivé hors périmètre")
  func whispersEmpty() throws {
    let empty = ActivityTab.whispers.empty
    let action = try #require(empty.action)

    #expect(french(empty.title) == "Aucun chuchotement disponible")
    #expect(french(empty.message) == "Vous trouvez un stream cool ? Dites-le à quelqu'un !")
    #expect(french(action) == "Commencer une conversation")
    #expect(english(empty.title) == "No Whispers Available")
    #expect(english(empty.message) == "See something cool in a stream? Tell someone about it!")
    #expect(english(action) == "Start a conversation")
    #expect(!ActivityEmpty.isActionEnabled)
  }
}
