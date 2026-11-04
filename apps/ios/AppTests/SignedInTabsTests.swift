import DesignSystem
import Navigation
import Testing
@testable import Twitch

@MainActor
@Suite("Barre d'onglets de l'app connectée, relevée sur profil/menu-compte--defaut")
struct SignedInTabsTests {
  private var tabs: [TabBarItem<AppTab>] { SignedInRoot.leadingTabs + SignedInRoot.trailingTabs }

  @Test("Home est à gauche du bouton « + », Profile à droite")
  func tabsAroundCreate() {
    #expect(SignedInRoot.leadingTabs.map(\.tab) == [.home])
    #expect(SignedInRoot.trailingTabs.map(\.tab) == [.profile])
  }

  @Test("les onglets s'intitulent Home et Profile, comme sur la capture")
  func titles() {
    #expect(tabs.map(\.title) == ["Home", "Profile"])
  }

  @Test("Home prend la maison au trait, pleine quand l'onglet est actif ; Profile prend l'avatar")
  func glyphs() {
    #expect(tabs.map(\.glyph) == [.mask(outline: .homeOutline, filled: .homeFilled), .avatar])
  }

  @Test("l'onglet Profile garde l'identifiant root.account visé par les flows Maestro")
  func profileIdentifier() {
    #expect(tabs.map(\.accessibilityIdentifier) == ["root.home", "root.account"])
  }
}
