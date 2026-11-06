import Dashboard
import DesignSystem
import Foundation
import Navigation
import Testing

@Suite("Textes de la feuille d'actions du bouton « + » (IMG_9611, IMG_9627)")
struct CreateActionsTextTests {
  @Test("le bouton « + » se lit « Créer » et dit qu'il ouvre les actions de création, pas « Gestionnaire de stream »")
  func createButton() {
    #expect(english(DashboardText.createButton) == "Create")
    #expect(french(DashboardText.createButton) == "Créer")
    #expect(english(DashboardText.createButtonHint) == "Opens the actions to stream or manage your channel.")
    #expect(french(DashboardText.createButtonHint) == "Ouvre les actions pour streamer ou gérer votre chaîne.")
  }

  @Test("le bouton « + » des deux barres d'onglets porte ce libellé et cet indice, avec son style", arguments: [
    TabBarCreateStyle.neutral,
    .accent,
  ])
  func createButtonInTabBar(style: TabBarCreateStyle) {
    let create = CreateButton.tabBarCreate(accessibilityIdentifier: "root.create", style: style) {}

    #expect(create.label == String(localized: DashboardText.createButton))
    #expect(create.hint == String(localized: DashboardText.createButtonHint))
    #expect(create.accessibilityIdentifier == "root.create")
    #expect(create.style == style)
  }

  @Test("le bouton violet propose de streamer depuis cet appareil")
  func streaming() {
    #expect(english(DashboardText.streaming) == "Streaming")
    #expect(english(DashboardText.streamingDetail) == "Stream from this device")
    #expect(french(DashboardText.streamingDetail) == "Streamer depuis cet appareil")
  }

  @Test("la ligne des clips de la rétrospective annonce qu'aucun clip n'est disponible")
  func recapClips() {
    #expect(english(DashboardText.recapClips) == "Add Clips to Your Recap")
    #expect(french(DashboardText.recapClips) == "Ajouter des clips à votre rétrospective")
    #expect(french(DashboardText.recapClipsUnavailable) == "Aucun clip de votre dernier stream n'est disponible")
  }

  @Test("en mode spectateur, la troisième ligne ouvre le tableau de bord des créateurs, sans glyphe")
  func enterRow() {
    let row = ModeSwitchRow(.enterDashboard)

    #expect(english(row.title) == "Creator Dashboard")
    #expect(french(row.title) == "Tableau de bord des créateurs")
    #expect(french(row.detail) == "Gérez votre chaîne et votre contenu")
    #expect(row.glyph == nil)
  }

  @Test("en mode créateur, elle quitte le tableau de bord, avec le glyphe de sortie")
  func leaveRow() {
    let row = ModeSwitchRow(.leaveDashboard)

    #expect(english(row.title) == "Exit Creator Dashboard")
    #expect(french(row.title) == "Quitter le tableau de bord des créateurs")
    #expect(french(row.detail) == "Regarder des streams, des clips et des stories")
    #expect(row.glyph == CreateSheetStyle.leaveGlyph)
  }

  @Test("Annuler referme la feuille")
  func cancel() {
    #expect(english(DashboardText.cancel) == "Cancel")
    #expect(french(DashboardText.cancel) == "Annuler")
  }

  @Test("l'écran de passage annonce le mode visé")
  func transition() {
    #expect(french(DashboardText.transition(to: .creator)) == "Passage au tableau de bord des créateurs")
    #expect(french(DashboardText.transition(to: .viewer)) == "Retour sur Twitch")
    #expect(english(DashboardText.transition(to: .viewer)) == "Back to Twitch")
  }
}
