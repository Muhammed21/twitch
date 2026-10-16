import Foundation
import Networking
import Testing

private let devInfo: [String: String] = ["API_BASE_URL": "http://127.0.0.1:3000", "OAUTH_CLIENT_ID": "twitch-ios-dev"]

private func configuration(baseURL: String = "http://127.0.0.1:3000") throws -> OAuthConfiguration {
  try OAuthConfiguration(infoDictionary: ["API_BASE_URL": baseURL, "OAUTH_CLIENT_ID": "twitch-ios-dev"])
}

@Suite("Configuration OAuth lue dans l'Info.plist")
struct OAuthConfigurationTests {
  @Test("lit API_BASE_URL et OAUTH_CLIENT_ID")
  func readsInfoPlist() throws {
    let configuration = try OAuthConfiguration(infoDictionary: devInfo)

    #expect(configuration.apiBaseURL.absoluteString == "http://127.0.0.1:3000")
    #expect(configuration.clientID == "twitch-ios-dev")
  }

  @Test("construit les endpoints better-auth et la ressource /v1 depuis API_BASE_URL, avec ou sans barre finale",
        arguments: ["http://127.0.0.1:3000", "http://127.0.0.1:3000/"])
  func endpoints(baseURL: String) throws {
    let configuration = try configuration(baseURL: baseURL)

    #expect(configuration.authorizationEndpoint.absoluteString == "http://127.0.0.1:3000/auth/oauth2/authorize")
    #expect(configuration.tokenEndpoint.absoluteString == "http://127.0.0.1:3000/auth/oauth2/token")
    #expect(configuration.revocationEndpoint.absoluteString == "http://127.0.0.1:3000/auth/oauth2/revoke")
    #expect(configuration.resource == "http://127.0.0.1:3000/v1")
  }

  @Test("redirige vers twitch://oauth/callback et demande openid, profile, email et offline_access")
  func redirectAndScopes() {
    #expect(OAuthConfiguration.redirectURI.absoluteString == "twitch://oauth/callback")
    #expect(OAuthConfiguration.callbackScheme == "twitch")
    #expect(OAuthConfiguration.scope == "openid profile email offline_access")
  }

  @Test("refuse une clé absente ou vide", arguments: ["API_BASE_URL", "OAUTH_CLIENT_ID"])
  func missingKey(key: String) {
    var info = devInfo
    info[key] = nil
    #expect(throws: ConfigurationError.missing(key: key)) { try OAuthConfiguration(infoDictionary: info) }
    info[key] = ""
    #expect(throws: ConfigurationError.missing(key: key)) { try OAuthConfiguration(infoDictionary: info) }
  }

  @Test("refuse une API_BASE_URL qui n'est pas une URL http(s) absolue",
        arguments: ["$(API_BASE_URL)", "127.0.0.1:3000", "ftp://127.0.0.1", "http://"])
  func invalidBaseURL(value: String) {
    #expect(throws: ConfigurationError.invalidAPIBaseURL(value)) { try configuration(baseURL: value) }
  }
}
