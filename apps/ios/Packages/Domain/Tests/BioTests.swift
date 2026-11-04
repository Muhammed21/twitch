import Domain
import Testing

@Suite("Bio : au plus 300 caractères, espaces des bords retirés")
struct BioTests {
  @Test(
    "compte les caractères restants sur le texte sans ses espaces de bord",
    arguments: [
      ("", 300),
      ("i love do gaming stream", 277),
      ("  i love do gaming stream \n", 277),
      ("é🎮", 298),
    ]
  )
  func remaining(text: String, expected: Int) {
    #expect(Bio.remaining(in: text) == expected)
  }

  @Test("au-delà de 300 caractères, il reste un nombre négatif et la bio n'est pas acceptée")
  func tooLong() {
    let text = String(repeating: "a", count: 301)

    #expect(Bio.remaining(in: text) == -1)
    #expect(!Bio.fits(text))
    #expect(Bio.fits(String(repeating: "a", count: 300)))
  }
}
