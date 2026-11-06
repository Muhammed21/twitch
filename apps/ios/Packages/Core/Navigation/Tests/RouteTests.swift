import Domain
import Foundation
import Navigation
import Testing

@Suite("Route et deep links (ADR 0010)")
struct RouteTests {
  @Test("twitch://channel/<slug> se décode en Route.channel", arguments: ["twitch://channel/jean_dupont", "twitch://channel/jean_dupont/"])
  func channelLink(link: String) throws {
    let url = try #require(URL(string: link))

    #expect(try Route(deepLink: url) == .channel(ChannelSlug("jean_dupont")))
  }

  @Test(
    "tout autre lien ne donne aucune Route",
    arguments: [
      "twitch://channel/Jean-Dupont",
      "twitch://channel/",
      "twitch://channel",
      "twitch://channel/jean_dupont/videos",
      "twitch://profile/jean_dupont",
      "twitch://oauth/callback?code=abc",
      "https://channel/jean_dupont",
      "https://www.twitch.tv/jean_dupont",
    ]
  )
  func otherLinks(link: String) throws {
    let url = try #require(URL(string: link))

    #expect(Route(deepLink: url) == nil)
  }

  @Test("le lien partagé d'une chaîne se rouvre sur cette chaîne")
  func sharedChannelLink() throws {
    let slug = try ChannelSlug("jean_dupont")

    #expect(slug.appLink == URL(string: "twitch://channel/jean_dupont"))
    #expect(Route(deepLink: slug.appLink) == .channel(slug))
  }
}

@MainActor
@Suite("Router")
struct RouterTests {
  @Test("empile les routes émises par les features")
  func push() throws {
    let router = Router()

    try router.push(.channel(ChannelSlug("jean_dupont")))
    try router.push(.channel(ChannelSlug("marie_curie")))

    #expect(try router.path == [.channel(ChannelSlug("jean_dupont")), .channel(ChannelSlug("marie_curie"))])
  }

  @Test("un deep link reconnu empile sa route ; un lien inconnu ne change rien")
  func open() throws {
    let router = Router()

    #expect(try router.open(#require(URL(string: "twitch://channel/jean_dupont"))))
    #expect(try !router.open(#require(URL(string: "twitch://profile/jean_dupont"))))

    #expect(try router.path == [.channel(ChannelSlug("jean_dupont"))])
  }

  @Test("reset ramène la pile à la racine")
  func reset() throws {
    let router = Router()
    try router.push(.channel(ChannelSlug("jean_dupont")))

    router.reset()

    #expect(router.path.isEmpty)
  }
}

@MainActor
@Suite("Router : onglets de la barre du bas")
struct RouterTabTests {
  @Test("l'app s'ouvre sur l'onglet Home, barre d'onglets visible")
  func startsOnHome() {
    let router = Router()

    #expect(router.selectedTab == .home)
    #expect(router.isTabBarVisible)
  }

  @Test("chaque onglet garde sa propre pile : une route émise depuis Profile ne touche pas Home")
  func stackPerTab() throws {
    let router = Router()
    try router.push(.channel(ChannelSlug("jean_dupont")))

    router.selectedTab = .profile
    try router.push(.channel(ChannelSlug("marie_curie")))

    #expect(try router.path == [.channel(ChannelSlug("jean_dupont"))])
    #expect(try router.profilePath == [.channel(ChannelSlug("marie_curie"))])
  }

  @Test("l'onglet Browse a sa propre pile, distincte de Home et de Profile")
  func browseStack() throws {
    let router = Router()
    router.selectedTab = .browse
    try router.push(.channel(ChannelSlug("ada_lovelace")))

    #expect(try router.browsePath == [.channel(ChannelSlug("ada_lovelace"))])
    #expect(router.path.isEmpty)
    #expect(router.profilePath.isEmpty)
    #expect(!router.isTabBarVisible)
  }

  @Test("reset vide aussi la pile de Browse")
  func resetBrowse() throws {
    let router = Router()
    router.selectedTab = .browse
    try router.push(.channel(ChannelSlug("ada_lovelace")))

    router.reset()

    #expect(router.selectedTab == .home)
    #expect(router.browsePath.isEmpty)
  }

  @Test("la barre d'onglets se masque quand une page de chaîne couvre l'onglet sélectionné")
  func tabBarHiddenOverChannel() throws {
    let router = Router()
    try router.push(.channel(ChannelSlug("jean_dupont")))

    #expect(!router.isTabBarVisible)

    router.selectedTab = .profile

    #expect(router.isTabBarVisible)
  }

  @Test("un deep link ouvert depuis Profile revient sur Home et y empile la chaîne")
  func deepLinkSelectsHome() throws {
    let router = Router()
    router.selectedTab = .profile

    #expect(try router.open(#require(URL(string: "twitch://channel/jean_dupont"))))

    #expect(router.selectedTab == .home)
    #expect(try router.path == [.channel(ChannelSlug("jean_dupont"))])
    #expect(router.profilePath.isEmpty)
  }

  @Test("un lien inconnu ne change pas d'onglet")
  func unknownLinkKeepsTab() throws {
    let router = Router()
    router.selectedTab = .profile

    #expect(try !router.open(#require(URL(string: "twitch://profile/jean_dupont"))))

    #expect(router.selectedTab == .profile)
  }

  @Test("reset vide les deux piles et revient sur Home")
  func resetAll() throws {
    let router = Router()
    try router.push(.channel(ChannelSlug("jean_dupont")))
    router.selectedTab = .profile
    try router.push(.channel(ChannelSlug("marie_curie")))

    router.reset()

    #expect(router.selectedTab == .home)
    #expect(router.path.isEmpty)
    #expect(router.profilePath.isEmpty)
  }

  @Test("le bouton « + » ouvre le Stream Manager par-dessus l'onglet courant, sans en changer")
  func createOpensStreamManager() {
    let router = Router()
    router.selectedTab = .profile

    router.create()

    #expect(router.isShowingStreamManager)
    #expect(router.selectedTab == .profile)
  }

  @Test("reset ferme le Stream Manager ouvert par « + »")
  func resetClosesStreamManager() {
    let router = Router()
    router.create()

    router.reset()

    #expect(!router.isShowingStreamManager)
  }

  @Test("un deep link ferme le Stream Manager pour montrer la chaîne")
  func deepLinkClosesStreamManager() throws {
    let router = Router()
    router.create()

    #expect(try router.open(#require(URL(string: "twitch://channel/jean_dupont"))))

    #expect(!router.isShowingStreamManager)
  }
}
