import Domain
import Foundation
import Profile
import Testing

@Suite("Textes d'Edit Profile, relevés sur profil/modifier-profil--defaut, modifier-profil--menu-photo et modifier-bio--saisie-clavier-ouvert")
struct EditProfileTextTests {
  @Test("le bouton, le titre, la section About et la ligne Bio")
  func labels() {
    #expect(english(EditProfileText.edit) == "Edit Profile")
    #expect(english(EditProfileText.title) == "Edit Profile")
    #expect(english(EditProfileText.about) == "About")
    #expect(english(EditProfileText.bio) == "Bio")
    #expect(english(EditProfileText.bioPlaceholder) == "Who you are in fewer than 300 characters.")
  }

  @Test("le compteur de la bio, comme « 277 characters remaining »", arguments: [(277, "277 characters remaining"), (300, "300 characters remaining")])
  func remaining(count: Int, expected: String) {
    #expect(english(EditProfileText.remaining(count)) == expected)
  }

  @Test(
    "en français, le compteur de la bio s'accorde au nombre",
    arguments: [(0, "0 caractère restant"), (1, "1 caractère restant"), (277, "277 caractères restants")]
  )
  func remainingInFrench(count: Int, expected: String) {
    #expect(french(EditProfileText.remaining(count)) == expected)
  }

  @Test("en français, l'écran s'intitule Modifier le profil et ses sections suivent")
  func frenchLabels() {
    #expect(french(EditProfileText.title) == "Modifier le profil")
    #expect(french(EditProfileText.about) == "À propos")
    #expect(french(EditProfileText.picture) == "Photo de profil")
    #expect(french(EditProfileText.banner) == "Bannière de profil")
    #expect(french(EditProfileText.bannerHint) == "1200\u{00A0}×\u{00A0}480 recommandé, moins de 10\u{00A0}Mo")
  }

  @Test("la section Brand, ses deux lignes et son pied")
  func brand() {
    #expect(english(EditProfileText.brand) == "Brand")
    #expect(english(EditProfileText.picture) == "Profile Picture")
    #expect(english(EditProfileText.pictureHint) == "JPEG, PNG, GIF and less than 10MB")
    #expect(english(EditProfileText.banner) == "Profile Banner")
    #expect(english(EditProfileText.bannerHint) == "Recommended 1200×480 and less than 10MB")
    #expect(english(EditProfileText.brandFooter) == "Customize you and your channel's visual appearance across Twitch.")
  }

  @Test("la feuille d'actions de la photo")
  func photoMenu() {
    #expect(english(EditProfileText.chooseExisting) == "Choose existing photo")
    #expect(english(EditProfileText.takePhoto) == "Take photo")
    #expect(english(EditProfileText.close) == "Close")
  }

  @Test(
    "un envoi refusé s'annonce sous la carte, selon l'image et la raison",
    arguments: [
      (ProfileImageStore.Phase.failed(.avatar, .tooLarge), "Your profile picture is over 10MB. Choose a smaller one."),
      (ProfileImageStore.Phase.failed(.banner, .tooLarge), "Your banner is over 10MB. Choose a smaller one."),
      (ProfileImageStore.Phase.failed(.avatar, .tooSmall), "Your profile picture must be at least 256×256."),
      (ProfileImageStore.Phase.failed(.banner, .tooSmall), "Your banner must be at least 1200×480."),
      (ProfileImageStore.Phase.failed(.avatar, .notSaved), "Couldn't save your profile picture. Try again."),
      (ProfileImageStore.Phase.failed(.banner, .notSaved), "Couldn't save your banner. Try again."),
      (ProfileImageStore.Phase.failed(.avatar, .cameraMissing), "No camera is available on this device."),
      (ProfileImageStore.Phase.failed(.banner, .cameraMissing), "No camera is available on this device."),
      (ProfileImageStore.Phase.failed(.avatar, .cameraRefused), "Allow camera access in Settings to take a photo."),
      (ProfileImageStore.Phase.failed(.banner, .cameraRefused), "Allow camera access in Settings to take a photo."),
    ]
  )
  @MainActor
  func failure(phase: ProfileImageStore.Phase, expected: String) {
    #expect(EditProfileText.notice(for: phase).map { english($0) } == expected)
  }

  @Test("rien ne s'annonce tant qu'aucun envoi n'a échoué", arguments: [ProfileImageStore.Phase.idle, .sending(.avatar), .sending(.banner)])
  @MainActor
  func noFailure(phase: ProfileImageStore.Phase) {
    #expect(EditProfileText.notice(for: phase) == nil)
  }
}
