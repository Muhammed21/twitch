import Domain
import Foundation
import Navigation
import Testing
@testable import Twitch

@MainActor
@Suite("Lien profond reçu en mode créateur")
struct CreatorModeDeepLinkTests {
  private func creatorMode() throws -> CreatorMode {
    let defaults = try #require(UserDefaults(suiteName: "CreatorModeDeepLinkTests.\(UUID().uuidString)"))
    let storage = DefaultsModeStorage(defaults: defaults)
    storage.save(.creator)
    return CreatorMode(storage: storage, hold: .zero)
  }

  @Test("un lien vers une chaîne ramène au mode spectateur, où la chaîne s'ouvre sur Accueil")
  func channelLink() throws {
    let creatorMode = try creatorMode()
    let router = Router()
    let url = try #require(URL(string: "twitch://channel/jean_dupont"))

    DeepLinkOpening.open(url, router: router, creatorMode: creatorMode)

    #expect(creatorMode.mode == .viewer)
    #expect(try router.path == [.channel(ChannelSlug("jean_dupont"))])
  }

  @Test("un lien que l'app ne connaît pas laisse le tableau de bord ouvert")
  func unknownLink() throws {
    let creatorMode = try creatorMode()
    let router = Router()
    let url = try #require(URL(string: "https://example.com/nothing"))

    DeepLinkOpening.open(url, router: router, creatorMode: creatorMode)

    #expect(creatorMode.mode == .creator)
    #expect(router.path.isEmpty)
  }
}
