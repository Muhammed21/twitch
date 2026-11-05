import DesignSystem
import Navigation
import Testing
@testable import Twitch

@MainActor
@Suite("Barre d'onglets de l'app connectée, relevée sur profil/menu-compte--defaut et parcourir/liste-categories--defaut")
struct SignedInTabsTests {
  private var tabs: [TabBarItem<AppTab>] { SignedInRoot.leadingTabs + SignedInRoot.trailingTabs }

  @Test("Home et Browse sont à gauche du bouton « + », Activité et Profile à droite (IMG_9612)")
  func tabsAroundCreate() {
    #expect(SignedInRoot.leadingTabs.map(\.tab) == [.home, .browse])
    #expect(SignedInRoot.trailingTabs.map(\.tab) == [.activity, .profile])
  }

  @Test("les onglets s'intitulent Accueil, Parcourir, Activité et Profil en français, en anglais Home, Browse, Activity et Profile")
  func titles() {
    let titles = tabs.map(\.title)
    #expect(titles == ["Accueil", "Parcourir", "Activité", "Profil"] || titles == ["Home", "Browse", "Activity", "Profile"])
  }

  @Test("Home prend la maison au trait, pleine quand l'onglet est actif ; Browse la loupe ; Activité la cloche ; Profile l'avatar")
  func glyphs() {
    #expect(tabs.map(\.glyph) == [
      .mask(outline: .homeOutline, filled: .homeFilled),
      .mask(outline: .browseOutline, filled: .browseFilled),
      ViewerTabGlyphs.activity,
      .avatar,
    ])
  }

  @Test("l'onglet Profile garde l'identifiant root.account visé par les flows Maestro, Browse prend root.browse, Activité root.activity")
  func profileIdentifier() {
    #expect(tabs.map(\.accessibilityIdentifier) == ["root.home", "root.browse", "root.activity", "root.account"])
  }
}
