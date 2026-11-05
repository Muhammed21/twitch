import Domain
import Foundation
import Profile
import Testing

@Suite("Textes d'Edit Profile, relevés sur profil/modifier-profil--defaut, modifier-profil--menu-photo et modifier-bio--saisie-clavier-ouvert")
struct EditProfileTextTests {
  @Test("le bouton, le titre, la section About et la ligne Bio")
  func labels() {
    #expect(String(localized: EditProfileText.edit) == "Edit Profile")
    #expect(String(localized: EditProfileText.title) == "Edit Profile")
    #expect(String(localized: EditProfileText.about) == "About")
    #expect(String(localized: EditProfileText.bio) == "Bio")
    #expect(String(localized: EditProfileText.bioPlaceholder) == "Who you are in fewer than 300 characters.")
  }

  @Test("le compteur de la bio, comme « 277 characters remaining »", arguments: [(277, "277 characters remaining"), (300, "300 characters remaining")])
  func remaining(count: Int, expected: String) {
    #expect(String(localized: EditProfileText.remaining(count)) == expected)
  }

  @Test("la section Brand, ses deux lignes et son pied")
  func brand() {
    #expect(String(localized: EditProfileText.brand) == "Brand")
    #expect(String(localized: EditProfileText.picture) == "Profile Picture")
    #expect(String(localized: EditProfileText.pictureHint) == "JPEG, PNG, GIF and less than 10MB")
    #expect(String(localized: EditProfileText.banner) == "Profile Banner")
    #expect(String(localized: EditProfileText.bannerHint) == "Recommended 1200×480 and less than 10MB")
    #expect(String(localized: EditProfileText.brandFooter) == "Customize you and your channel's visual appearance across Twitch.")
  }

  @Test("la feuille d'actions de la photo")
  func photoMenu() {
    #expect(String(localized: EditProfileText.chooseExisting) == "Choose existing photo")
    #expect(String(localized: EditProfileText.close) == "Close")
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
    ]
  )
  @MainActor
  func failure(phase: ProfileImageStore.Phase, expected: String) {
    #expect(EditProfileText.notice(for: phase).map { String(localized: $0) } == expected)
  }

  @Test("rien ne s'annonce tant qu'aucun envoi n'a échoué", arguments: [ProfileImageStore.Phase.idle, .sending(.avatar), .sending(.banner)])
  @MainActor
  func noFailure(phase: ProfileImageStore.Phase) {
    #expect(EditProfileText.notice(for: phase) == nil)
  }
}
