import Domain
import Foundation
import Testing

private let secret = "live_7f3a9c2e4b1d"
private let ingestURL = URL(string: "rtmp://127.0.0.1:1935/live") ?? URL(fileURLWithPath: "/")

@Suite("Clé de stream : jamais écrite en clair ailleurs qu'à la demande")
struct StreamKeyTests {
  @Test("la clé n'apparaît dans aucune description, ni dans le miroir que lisent dump et les logs")
  func neverDescribed() {
    let key = StreamKey(secret, ingestURL: ingestURL)
    var dumped = ""
    dump(key, to: &dumped)

    let renderings = [
      "\(key)",
      String(describing: key),
      String(reflecting: key),
      dumped,
      "\(Mirror(reflecting: key).children.map { "\($0.label ?? ""): \($0.value)" })",
    ]

    #expect(renderings.allSatisfy { !$0.contains(secret) })
    #expect(String(describing: key).contains("rtmp://127.0.0.1:1935/live"))
  }

  @Test("la clé se lit en clair seulement quand on la demande")
  func revealedOnDemand() {
    let key = StreamKey(secret, ingestURL: ingestURL)

    #expect(key.revealed == secret)
    #expect(key.ingestURL == ingestURL)
  }

  @Test("une chaîne d'erreur qui embarque la clé ne la montre pas non plus")
  func notInWrappingValues() {
    let key = StreamKey(secret, ingestURL: ingestURL)

    #expect(!String(describing: [key]).contains(secret))
    #expect(!String(describing: Optional(key)).contains(secret))
  }
}
