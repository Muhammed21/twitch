import Foundation
import Networking
import Testing

private var info: [String: Any] { Bundle.main.infoDictionary ?? [:] }

@Suite("Info.plist de l'app en Debug")
struct AppConfigurationTests {
  @Test("pointe vers l'API locale avec le client OAuth de développement")
  func oauthConfiguration() throws {
    let configuration = try OAuthConfiguration(infoDictionary: info)

    #expect(configuration.apiBaseURL.absoluteString == "http://127.0.0.1:3000")
    #expect(configuration.clientID == "twitch-ios-dev")
  }

  @Test("déclare le schéma d'URL twitch de la redirection OAuth")
  func urlScheme() {
    let types = info["CFBundleURLTypes"] as? [[String: Any]] ?? []
    let schemes = types.flatMap { $0["CFBundleURLSchemes"] as? [String] ?? [] }

    #expect(schemes == [OAuthConfiguration.callbackScheme])
  }

  @Test("n'ouvre ATS qu'au réseau local")
  func appTransportSecurity() {
    let ats = info["NSAppTransportSecurity"] as? [String: Bool]

    #expect(ats == ["NSAllowsLocalNetworking": true])
  }
}
