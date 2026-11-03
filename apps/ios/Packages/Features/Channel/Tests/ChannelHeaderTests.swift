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
}
