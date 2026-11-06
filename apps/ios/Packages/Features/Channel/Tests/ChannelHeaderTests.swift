@testable import Channel
import Domain
import Foundation
import Testing

private let english = Locale(identifier: "en_US")

@Suite("ChannelHeader : ce que l'en-tête affiche du statut")
struct ChannelHeaderTests {
  @Test(
    "affiche le compteur de viewers en notation compacte",
    arguments: [(0, "0"), (42, "42"), (999, "999"), (52300, "52K"), (1_250_000, "1.2M")]
  )
  func compactCount(count: Int, expected: String) throws {
    #expect(try HeaderLine(status: .live(viewers: ViewerCount(count)), locale: english).viewers == expected)
  }

  @Test("en live, l'en-tête montre le badge live ; hors live ou inconnu, ni badge ni compteur")
  func badge() {
    #expect(HeaderLine(status: .live(viewers: nil), locale: english) == HeaderLine(isLive: true, viewers: nil))
    #expect(HeaderLine(status: .offline, locale: english) == HeaderLine(isLive: false, viewers: nil))
    #expect(HeaderLine(status: nil, locale: english) == HeaderLine(isLive: false, viewers: nil))
  }

  @Test("l'en-tête montre le titre de la chaîne, ou dit qu'elle n'existe pas")
  func title() {
    #expect(ChannelText.title("Speedrun", channelNotFound: false) == "Speedrun")
    #expect(ChannelText.title(nil, channelNotFound: false) == "")
    #expect(ChannelText.title(nil, channelNotFound: true) == shown(english: "This channel doesn't exist.", french: "Cette chaîne n'existe pas."))
  }
}

@Suite("ChannelHeader lu par VoiceOver")
struct ChannelHeaderAccessibilityTests {
  @Test("le badge LIVE se lit « en direct », pas lettre à lettre")
  func liveBadgeSpoken() {
    #expect(ChannelText.liveSpoken == shown(english: "Live", french: "En direct"))
  }

  @Test("le compteur se lit avec son unité")
  func viewersSpoken() {
    #expect(ChannelText.viewers("52K") == shown(english: "52K viewers", french: "52K spectateurs"))
  }
}
