import Analytics
import Foundation
import Testing

@Suite("Configuration PostHog lue dans l'Info.plist")
struct AnalyticsConfigurationTests {
  @Test("une clé projet et un hôte https donnent une configuration")
  func configured() throws {
    let configuration = try #require(AnalyticsConfiguration(info: [
      "POSTHOG_PROJECT_KEY": "phc_project",
      "POSTHOG_HOST": "https://t.example.com",
    ]))

    #expect(configuration.projectKey == "phc_project")
    #expect(configuration.host == URL(string: "https://t.example.com"))
  }

  @Test("une clé projet est lue sans les espaces qui l'entourent")
  func trimmedKey() {
    let configuration = AnalyticsConfiguration(info: [
      "POSTHOG_PROJECT_KEY": " phc_project\n",
      "POSTHOG_HOST": "https://t.example.com",
    ])

    #expect(configuration?.projectKey == "phc_project")
  }

  @Test("sans clé projet, l'analytics est désactivée", arguments: [nil, "", "  "])
  func missingKey(key: String?) {
    let info: [String: Any] = ["POSTHOG_HOST": "https://t.example.com"].merging(key.map { ["POSTHOG_PROJECT_KEY": $0] } ?? [:]) { $1 }

    #expect(AnalyticsConfiguration(info: info) == nil)
  }

  @Test("sans hôte exploitable, l'analytics est désactivée", arguments: [nil, "", "pas une url", "ftp://t.example.com", "https://"])
  func missingHost(host: String?) {
    let info: [String: Any] = ["POSTHOG_PROJECT_KEY": "phc_project"].merging(host.map { ["POSTHOG_HOST": $0] } ?? [:]) { $1 }

    #expect(AnalyticsConfiguration(info: info) == nil)
  }

  @Test("une clé qui n'est pas une chaîne désactive l'analytics")
  func keyOfWrongType() {
    #expect(AnalyticsConfiguration(info: ["POSTHOG_PROJECT_KEY": 42, "POSTHOG_HOST": "https://t.example.com"]) == nil)
  }
}
