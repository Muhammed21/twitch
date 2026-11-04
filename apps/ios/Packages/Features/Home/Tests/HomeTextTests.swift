import Home
import Testing

@Suite("Libellés de l'accueil")
struct HomeTextTests {
  @Test("le badge d'une carte de live dit LIVE, comme sur parcourir/liste-chaines-live--defaut")
  func liveBadge() {
    #expect(HomeCardText.liveBadge == "LIVE")
  }
}
