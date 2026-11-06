import Foundation
import Profile
import Testing

@Suite("Modifier le profil au VoiceOver : les échecs sont annoncés")
struct EditProfileAccessibilityTests {
  @Test("l'échec d'enregistrement de la bio est annoncé, le message affiché mot pour mot")
  func bioFailureAnnounced() {
    #expect(EditProfileText.bioAnnouncement(hasFailed: true) == String(localized: EditProfileText.bioFailed))
  }

  @Test("sans échec, rien n'est annoncé")
  func bioSilent() {
    #expect(EditProfileText.bioAnnouncement(hasFailed: false) == nil)
  }

  @Test("l'échec d'envoi d'une image est annoncé avec le message affiché")
  @MainActor
  func imageFailureAnnounced() {
    let phase = ProfileImageStore.Phase.failed(.avatar, .tooLarge)

    #expect(EditProfileText.announcement(for: phase) == EditProfileText.notice(for: phase).map { String(localized: $0) })
    #expect(EditProfileText.announcement(for: phase) != nil)
  }

  @Test("pendant un envoi, rien n'est annoncé")
  @MainActor
  func imageSendingSilent() {
    #expect(EditProfileText.announcement(for: .sending(.banner)) == nil)
  }
}
