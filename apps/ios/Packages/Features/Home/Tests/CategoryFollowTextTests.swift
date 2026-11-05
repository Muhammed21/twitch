import Foundation
@testable import Home
import Testing

@Suite("En-tête d'une catégorie : libellés du suivi (chaine/page-chaine--defaut et --toast-plus-suivi)")
struct CategoryFollowTextTests {
  @Test("le compteur met le nombre en gras, en notation compacte, comme « 6M followers »", arguments: [
    (41, "41 followers"), (6_000_000, "6M followers"), (1200, "1.2K followers"),
  ])
  func followers(count: Int, expected: String) throws {
    let text = BrowseText.followers(count, locale: Locale(identifier: "en_US"))
    let number = try #require(text.range(of: expected.components(separatedBy: " ")[0]))

    #expect(String(text.characters) == expected)
    #expect(text[number].inlinePresentationIntent == InlinePresentationIntent.stronglyEmphasized)
  }

  @Test("le menu et l'alerte reprennent ceux de la page de chaîne, avec le nom de la catégorie")
  func unfollowTexts() {
    #expect(BrowseText.unfollow == shown(english: "Unfollow", french: "Ne plus suivre"))
    #expect(BrowseText.cancel == shown(english: "Cancel", french: "Annuler"))
    #expect(BrowseText.unfollowQuestion(name: "Just Chatting") == shown(english: "Are you sure you want to unfollow Just Chatting?", french: "Voulez-vous vraiment ne plus suivre Just Chatting\u{00A0}?"))
  }

  @Test("le bouton dit Follow, et Following une fois la catégorie suivie")
  func labels() {
    #expect(BrowseText.followLabel(isFollowing: false) == shown(english: "Follow", french: "Suivre"))
    #expect(BrowseText.followLabel(isFollowing: true) == shown(english: "Following", french: "Suivi"))
  }
}
