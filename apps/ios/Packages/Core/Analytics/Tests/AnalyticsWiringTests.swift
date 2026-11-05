import Analytics
import AnalyticsTesting
import Domain
import Foundation
import Testing

private let viewerID = UUID(uuidString: "6F9619FF-8B86-D011-B42D-00C04FC964FF")!

@MainActor
@Suite("Analytics sans clé PostHog")
struct DisabledAnalyticsTests {
  @Test("sans clé projet, l'analytics est un no-op qui ne plante pas")
  func noKey() throws {
    let defaults = try #require(UserDefaults(suiteName: "analytics-tests-\(UUID().uuidString)"))
    let analytics = ProductAnalytics.live(info: ["POSTHOG_HOST": "https://t.example.com"], defaults: defaults)

    analytics.capture(.accountSignedIn)
    analytics.identify(viewerID)
    analytics.reset()

    #expect(analytics.isEnabled == false)
  }
}

@MainActor
@Suite("Double d'analytics pour les tests des features")
struct RecordingAnalyticsTests {
  @Test("enregistre les appels dans l'ordre et expose les seuls événements capturés")
  func records() {
    let analytics = RecordingAnalytics()

    analytics.identify(viewerID)
    analytics.capture(.accountSignedIn)
    analytics.reset()

    #expect(analytics.calls == [.identify(viewerID), .capture(.accountSignedIn), .reset])
    #expect(analytics.captured == [.accountSignedIn])
  }
}
