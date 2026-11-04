import DesignSystem
import Navigation
import Testing
@testable import Twitch

@MainActor
@Suite("Barre d'onglets de l'app connectée, relevée sur profil/menu-compte--defaut")
struct SignedInTabsTests {
  @Test("la barre propose Home puis Profile, les seuls onglets du périmètre livré")
  func tabsInOrder() {
    #expect(SignedInRoot.tabs.map(\.tab) == [.home, .profile])
  }

  @Test("les onglets s'intitulent Home et Profile, comme sur la capture")
  func titles() {
    #expect(SignedInRoot.tabs.map(\.title) == ["Home", "Profile"])
  }

  @Test("Home prend la maison au trait, pleine quand l'onglet est actif ; Profile prend l'avatar")
  func glyphs() {
    #expect(SignedInRoot.tabs.map(\.glyph) == [.symbol(outline: "house", filled: "house.fill"), .avatar])
  }

  @Test("l'onglet Profile garde l'identifiant root.account visé par les flows Maestro")
  func profileIdentifier() {
    #expect(SignedInRoot.tabs.map(\.accessibilityIdentifier) == ["root.home", "root.account"])
  }
}
