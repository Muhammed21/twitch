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

  @Test("le bouton dit Follow, et Following une fois la catégorie suivie")
  func labels() {
    #expect(BrowseText.followLabel(isFollowing: false) == "Follow")
    #expect(BrowseText.followLabel(isFollowing: true) == "Following")
  }
}
