import Foundation

public enum AuthorizationIntent: Equatable, Sendable {
  case signIn
  case signUp
}

public enum AuthorizationError: Error, Equatable, Sendable {
  case unexpectedRedirect
  case stateMismatch
  case server(code: String)
  case missingCode
}

public struct AuthorizationAttempt: Equatable, Sendable {
  private static let stateByteCount = 32

  public let url: URL
  public let state: String
  public let pkce: PKCE

  public init(configuration: OAuthConfiguration, intent: AuthorizationIntent, randomBytes: PKCE.RandomBytes) {
    let pkce = PKCE(randomBytes: randomBytes)
    let state = Base64URL.encode(randomBytes(Self.stateByteCount))
    let prompt = intent == .signUp ? [URLQueryItem(name: "prompt", value: "create")] : []
    self.pkce = pkce
    self.state = state
    url = configuration.authorizationEndpoint.appending(queryItems: [
      URLQueryItem(name: "response_type", value: "code"),
      URLQueryItem(name: "client_id", value: configuration.clientID),
      URLQueryItem(name: "redirect_uri", value: OAuthConfiguration.redirectURI.absoluteString),
      URLQueryItem(name: "scope", value: OAuthConfiguration.scope),
      URLQueryItem(name: "state", value: state),
      URLQueryItem(name: "code_challenge", value: pkce.challenge),
      URLQueryItem(name: "code_challenge_method", value: PKCE.method),
      URLQueryItem(name: "resource", value: configuration.resource),
    ] + prompt)
  }

  public func authorizationCode(from callback: URL) throws(AuthorizationError) -> String {
    guard let components = URLComponents(url: callback, resolvingAgainstBaseURL: false),
          Self.isRedirectURI(components)
    else { throw .unexpectedRedirect }
    let items = components.queryItems ?? []
    let value = { (name: String) in items.first { $0.name == name }?.value }
    guard value("state") == state else { throw .stateMismatch }
    if let error = value("error") { throw .server(code: error) }
    guard let code = value("code"), !code.isEmpty else { throw .missingCode }
    return code
  }

  private static func isRedirectURI(_ components: URLComponents) -> Bool {
    let expected = OAuthConfiguration.redirectURI
    return components.scheme == expected.scheme && components.host == expected.host() && components.path == expected.path()
  }
}
