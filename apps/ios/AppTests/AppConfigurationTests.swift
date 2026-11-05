import Analytics
import Domain
import Foundation
import Networking
import Testing
@testable import Twitch

private var info: [String: Any] { Bundle.main.infoDictionary ?? [:] }

@Suite("Info.plist de l'app en Debug")
struct AppConfigurationTests {
  @Test("pointe vers l'API locale avec le client OAuth de développement")
  func oauthConfiguration() throws {
    let configuration = try OAuthConfiguration(infoDictionary: info)

    #expect(configuration.apiBaseURL.absoluteString == "http://127.0.0.1:3000")
    #expect(configuration.clientID == "twitch-ios-dev")
  }

  @Test("porte la version envoyée en X-Client-Version, au format majeure.mineure.correctif")
  func clientVersion() throws {
    let version = try #require(Composition.clientVersion(info: info))

    #expect(try AppVersion(version).description == version)
    #expect(version == info["CFBundleShortVersionString"] as? String)
  }

  @Test("pointe vers le serveur de chat local")
  func chatBaseURL() {
    #expect(Composition.chatBaseURL(info: info)?.absoluteString == "http://127.0.0.1:3001")
  }

  @Test("refuse une adresse de chat absente ou sans hôte", arguments: [[:], ["CHAT_BASE_URL": ""], ["CHAT_BASE_URL": "chat"]])
  func invalidChatBaseURL(info: [String: String]) {
    #expect(Composition.chatBaseURL(info: info) == nil)
  }

  @Test("déclare le schéma d'URL twitch de la redirection OAuth")
  func urlScheme() {
    let types = info["CFBundleURLTypes"] as? [[String: Any]] ?? []
    let schemes = types.flatMap { $0["CFBundleURLSchemes"] as? [String] ?? [] }

    #expect(schemes == [OAuthConfiguration.callbackScheme])
  }

  @Test("porte la clé du projet PostHog et l'hôte de la région EU")
  func analyticsConfiguration() throws {
    let configuration = try #require(AnalyticsConfiguration(info: info))

    #expect(configuration.projectKey == "phc_x8qVBvQyHmpTTxtReyWBi487xBP4jSavvfJYPd5Na9ai")
    #expect(configuration.host.absoluteString == "https://eu.i.posthog.com")
  }

  @Test("n'ouvre ATS qu'au réseau local")
  func appTransportSecurity() {
    let ats = info["NSAppTransportSecurity"] as? [String: Bool]

    #expect(ats == ["NSAllowsLocalNetworking": true])
  }
}
