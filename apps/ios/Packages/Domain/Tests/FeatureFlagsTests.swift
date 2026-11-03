import Domain
import Testing

@Suite("FeatureFlags")
struct FeatureFlagsTests {
  @Test("les valeurs par défaut sûres coupent le session replay (ADR 0012)")
  func safeDefaults() {
    #expect(FeatureFlags.safeDefaults == FeatureFlags(sessionReplay: false))
  }
}
