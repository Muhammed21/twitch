import Foundation
import Profile
import Testing

@Suite("Textes d'Edit Profile, relevés sur profil/modifier-profil--defaut et modifier-bio--saisie-clavier-ouvert")
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
}
