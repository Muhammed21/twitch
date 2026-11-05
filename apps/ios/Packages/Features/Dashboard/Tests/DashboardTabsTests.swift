import Dashboard
import DesignSystem
import Navigation
import Testing

@Suite("Barre d'onglets du tableau de bord des créateurs (IMG_9624 à IMG_9626)")
struct DashboardTabsTests {
  @Test("Accueil et Contenu à gauche du « + », Statistiques et Chaîne à droite")
  func order() {
    #expect(DashboardTabs.leading.map(\.tab) == [.home, .content])
    #expect(DashboardTabs.trailing.map(\.tab) == [.stats, .channel])
  }

  @Test("chaque onglet prend le glyphe de la capture")
  func glyphs() {
    #expect((DashboardTabs.leading + DashboardTabs.trailing).map(\.glyph) == [
      DashboardTabGlyphs.home,
      DashboardTabGlyphs.content,
      DashboardTabGlyphs.stats,
      DashboardTabGlyphs.channel,
    ])
  }

  @Test("chaque onglet a un identifiant d'accessibilité pour les flows Maestro")
  func identifiers() {
    #expect((DashboardTabs.leading + DashboardTabs.trailing).map(\.accessibilityIdentifier) == [
      "dashboard.home", "dashboard.content", "dashboard.stats", "dashboard.channel",
    ])
  }

  @Test("le « + » du mode créateur est la pilule violette")
  func createStyle() {
    #expect(DashboardTabs.createStyle == .accent)
  }
}
