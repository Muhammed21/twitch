import Domain
import Foundation
import Home
import Testing

@Suite("Libellés de l'accueil")
struct HomeTextTests {
  @Test("le badge d'une carte de live dit LIVE, comme sur parcourir/liste-chaines-live--defaut")
  func liveBadge() {
    #expect(HomeCardText.liveBadge == "LIVE")
  }

  @Test(
    "les viewers s'abrègent comme « 3K viewers » sur parcourir/liste-chaines-live--defaut",
    arguments: [(0, "0 viewers"), (842, "842 viewers"), (3000, "3K viewers"), (14200, "14K viewers")]
  )
  func viewers(count: Int, expected: String) throws {
    #expect(try HomeCardText.viewers(ViewerCount(count), locale: Locale(identifier: "en_US")) == expected)
  }

  @Test("sans compteur lu par l'API, la carte n'affiche pas de viewers")
  func unknownViewers() {
    #expect(HomeCardText.viewers(nil, locale: Locale(identifier: "en_US")) == nil)
  }
}
