import DesignSystem
import Testing

@Suite("Annonce VoiceOver d'un message qui apparaît, comme une erreur")
struct AnnouncementTests {
  @Test("un message qui apparaît est annoncé")
  func appearingMessage() {
    #expect(Announcement.spoken(from: nil, to: "Impossible de charger les catégories.") == "Impossible de charger les catégories.")
  }

  @Test("un message qui change est annoncé dans sa nouvelle version")
  func changedMessage() {
    #expect(Announcement.spoken(from: "Erreur réseau", to: "Session expirée") == "Session expirée")
  }

  @Test("un message inchangé ou qui disparaît n'est pas répété")
  func silentOtherwise() {
    #expect(Announcement.spoken(from: "Erreur réseau", to: "Erreur réseau") == nil)
    #expect(Announcement.spoken(from: "Erreur réseau", to: nil) == nil)
    #expect(Announcement.spoken(from: nil, to: nil) == nil)
  }
}
