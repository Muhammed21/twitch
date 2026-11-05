import DesignSystem
import Navigation
import Testing
@testable import Twitch

@MainActor
@Suite("Barre d'onglets de l'app connectée, relevée sur profil/menu-compte--defaut et parcourir/liste-categories--defaut")
struct SignedInTabsTests {
  private var tabs: [TabBarItem<AppTab>] { SignedInRoot.leadingTabs + SignedInRoot.trailingTabs }

  @Test("Home et Browse sont à gauche du bouton « + », Profile à droite")
  func tabsAroundCreate() {
    #expect(SignedInRoot.leadingTabs.map(\.tab) == [.home, .browse])
    #expect(SignedInRoot.trailingTabs.map(\.tab) == [.profile])
  }

  @Test("les onglets s'intitulent Accueil, Parcourir et Profil en français, Home, Browse et Profile en anglais")
  func titles() {
    let titles = tabs.map(\.title)
    #expect(titles == ["Accueil", "Parcourir", "Profil"] || titles == ["Home", "Browse", "Profile"])
  }

  @Test("Home prend la maison au trait, pleine quand l'onglet est actif ; Browse la loupe ; Profile l'avatar")
  func glyphs() {
    #expect(tabs.map(\.glyph) == [
      .mask(outline: .homeOutline, filled: .homeFilled),
      .mask(outline: .browseOutline, filled: .browseFilled),
      .avatar,
    ])
  }

  @Test("l'onglet Profile garde l'identifiant root.account visé par les flows Maestro, Browse prend root.browse")
  func profileIdentifier() {
    #expect(tabs.map(\.accessibilityIdentifier) == ["root.home", "root.browse", "root.account"])
  }
}
