import Dashboard
import Navigation
import Testing

@Suite("Textes du tableau de bord des créateurs (IMG_9624 à IMG_9626)")
struct DashboardTextTests {
  @Test(
    "chaque onglet porte le libellé de la capture, repris en titre de son écran",
    arguments: [
      (DashboardTab.home, "Home", "Accueil"),
      (.content, "Content", "Contenu"),
      (.stats, "Analytics", "Statistiques"),
      (.channel, "Channel", "Chaîne"),
    ]
  )
  func tabTitles(tab: DashboardTab, english expectedEnglish: String, french expectedFrench: String) {
    #expect(english(DashboardText.title(of: tab)) == expectedEnglish)
    #expect(french(DashboardText.title(of: tab)) == expectedFrench)
  }

  @Test("l'en-tête de l'accueil propose de regarder des streams")
  func watch() {
    #expect(english(DashboardText.watch) == "Watch")
    #expect(french(DashboardText.watch) == "Regarder")
  }

  @Test("Statistiques, vide : aucun résumé de stream, calendrier et information dans l'en-tête")
  func statsEmpty() {
    #expect(french(DashboardText.statsEmpty) == "Aucun résumé de stream pour votre chaîne")
    #expect(french(DashboardText.calendar) == "Calendrier")
    #expect(french(DashboardText.info) == "Informations")
  }

  @Test("Contenu, vide : Trier, champ Rechercher et aucun clip de la chaîne")
  func contentEmpty() {
    #expect(french(DashboardText.contentEmpty) == "Aucun clip de votre chaîne")
    #expect(french(DashboardText.sort) == "Trier")
    #expect(french(DashboardText.search) == "Rechercher")
    #expect(english(DashboardText.search) == "Search")
  }
}
