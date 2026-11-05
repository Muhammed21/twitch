@testable import Analytics
import Foundation
@testable import PostHog
import Testing

@MainActor
@Suite("Configuration du SDK PostHog (ADR 0012 §1 et §7, ADR 0016)")
struct PostHogConfigTests {
  private func makeConfig() throws -> PostHogConfig {
    let configuration = try #require(AnalyticsConfiguration(info: [
      "POSTHOG_PROJECT_KEY": "phc_project",
      "POSTHOG_HOST": "https://eu.i.posthog.com",
    ]))
    return PostHogBackend.config(configuration)
  }

  @Test("parle au projet et à l'hôte de la configuration")
  func projectAndHost() throws {
    let config = try makeConfig()

    #expect(config.projectToken == "phc_project")
    #expect(config.host == URL(string: "https://eu.i.posthog.com"))
  }

  @Test("coupe le session replay, l'autocapture, les écrans et le cycle de vie")
  func noAutomaticCapture() throws {
    let config = try makeConfig()

    #expect(config.sessionReplay == false)
    #expect(config.captureScreenViews == false)
    #expect(config.captureApplicationLifecycleEvents == false)
    #expect(config.enableSwizzling == false)
  }

  @Test("ne laisse pas le SDK évaluer les flags : la variante vient du bootstrap")
  func noClientFlags() throws {
    let config = try makeConfig()

    #expect(config.preloadFeatureFlags == false)
    #expect(config.sendFeatureFlagEvent == false)
  }

  @Test("le before_send du SDK retire la PII d'un événement")
  func beforeSendRedacts() throws {
    let config = try makeConfig()
    let event = PostHogEvent(
      event: "account:signed_in",
      distinctId: "anonymous",
      properties: ["email": "viewer@twitch.local", "$ip": "10.0.0.1", "$os_name": "iOS"]
    )

    let sent = try #require(config.runBeforeSend(event))

    #expect(sent.properties.keys.sorted() == ["$os_name"])
  }
}
