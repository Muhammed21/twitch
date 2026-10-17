import Auth
import Foundation
import Testing

@Suite("Illustration de « You're All Set! » (ADR 0040)")
struct AllSetIllustrationTests {
  @Test("l'app embarque l'illustration de docs/brand, octet pour octet")
  func identicalToBrand() throws {
    let brand = URL(filePath: #filePath)
      .deletingLastPathComponent()
      .appending(path: "../../../../../../docs/brand/you-are-all-set.png")
      .standardized
    let bundled = try #require(AllSetIllustration.url)

    #expect(try Data(contentsOf: bundled) == Data(contentsOf: brand))
  }
}
