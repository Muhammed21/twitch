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
}
