import Domain
import Testing

@Suite("AppVersion")
struct AppVersionTests {
  @Test("lit une version majeure.mineure.correctif", arguments: ["0.1.0", "1.0.0", "12.34.567"])
  func accepted(value: String) throws {
    #expect(try AppVersion(value).description == value)
  }

  @Test(
    "refuse ce qui sort de ^\\d+\\.\\d+\\.\\d+$",
    arguments: ["", "1", "1.0", "1.0.0.0", "v1.0.0", "1.0.0-beta", "1..0", "1.a.0", " 1.0.0", "1.0.-1", "1.0.+1", "١.٠.٠"]
  )
  func malformed(value: String) {
    #expect(throws: AppVersionError.malformed(value)) {
      try AppVersion(value)
    }
  }

  @Test(
    "se compare composante par composante, en nombres",
    arguments: [
      ("0.1.0", "0.2.0"),
      ("0.9.0", "0.10.0"),
      ("1.2.3", "1.2.4"),
      ("1.9.9", "2.0.0"),
      ("1.2.9", "1.3.0"),
    ]
  )
  func ordering(lower: String, higher: String) throws {
    #expect(try AppVersion(lower) < AppVersion(higher))
    #expect(try !(AppVersion(higher) < AppVersion(lower)))
  }

  @Test("deux écritures de la même version sont égales")
  func equality() throws {
    #expect(try AppVersion("1.02.0") == AppVersion("1.2.0"))
    #expect(try !(AppVersion("1.2.0") < AppVersion("1.2.0")))
  }
}
