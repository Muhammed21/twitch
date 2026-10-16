import Foundation
import Networking
import Testing

private let configuration = OAuthConfiguration(
  apiBaseURL: URL(string: "http://127.0.0.1:3000")!,
  clientID: "twitch-ios-dev"
)

private func makeAttempt(intent: AuthorizationIntent = .signIn) -> AuthorizationAttempt {
  let counter = ByteCounter()
  return AuthorizationAttempt(configuration: configuration, intent: intent, randomBytes: counter.next)
}

private func queryItems(of url: URL) -> [String: String] {
  let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
  return Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
}

private func callback(_ query: String) -> URL {
  URL(string: "twitch://oauth/callback?\(query)")!
}

@Suite("Requête d'autorisation OAuth")
struct AuthorizationAttemptTests {
  @Test("vise l'endpoint authorize avec PKCE S256, la ressource /v1, les scopes et le state")
  func signInURL() {
    let attempt = makeAttempt()

    #expect(attempt.url.absoluteString.hasPrefix("http://127.0.0.1:3000/auth/oauth2/authorize?"))
    #expect(queryItems(of: attempt.url) == [
      "response_type": "code",
      "client_id": "twitch-ios-dev",
      "redirect_uri": "twitch://oauth/callback",
      "scope": "openid profile email offline_access",
      "state": attempt.state,
      "code_challenge": attempt.pkce.challenge,
      "code_challenge_method": "S256",
      "resource": "http://127.0.0.1:3000/v1",
    ])
  }

  @Test("l'inscription ouvre la même autorisation avec prompt=create")
  func signUpURL() {
    var expected = queryItems(of: makeAttempt(intent: .signIn).url)
    expected["prompt"] = "create"

    #expect(queryItems(of: makeAttempt(intent: .signUp).url) == expected)
  }

  @Test("le state est tiré de 32 octets d'aléa, distincts de ceux du code_verifier")
  func stateFromRandomness() {
    let attempt = makeAttempt()

    #expect(attempt.state.count == 43)
    #expect(attempt.state != attempt.pkce.verifier)
  }

  @Test("extrait le code d'un callback dont le state correspond")
  func extractsCode() throws {
    let attempt = makeAttempt()

    #expect(try attempt.authorizationCode(from: callback("code=abc&state=\(attempt.state)")) == "abc")
  }

  @Test("refuse un callback dont le state diffère ou manque, même s'il porte un code",
        arguments: ["code=abc&state=autre", "code=abc", "error=access_denied&state=autre"])
  func stateMismatch(query: String) {
    #expect(throws: AuthorizationError.stateMismatch) { try makeAttempt().authorizationCode(from: callback(query)) }
  }

  @Test("remonte l'erreur renvoyée par le serveur")
  func serverError() {
    let attempt = makeAttempt()

    #expect(throws: AuthorizationError.server(code: "access_denied")) {
      try attempt.authorizationCode(from: callback("error=access_denied&state=\(attempt.state)"))
    }
  }

  @Test("refuse un callback sans code")
  func missingCode() {
    let attempt = makeAttempt()

    #expect(throws: AuthorizationError.missingCode) {
      try attempt.authorizationCode(from: callback("state=\(attempt.state)"))
    }
  }

  @Test("refuse une redirection qui n'est pas twitch://oauth/callback",
        arguments: ["twitch://autre/callback", "twitch://oauth/autre", "autre://oauth/callback"])
  func unexpectedRedirect(base: String) throws {
    let attempt = makeAttempt()

    #expect(throws: AuthorizationError.unexpectedRedirect) {
      try attempt.authorizationCode(from: #require(URL(string: "\(base)?code=abc&state=\(attempt.state)")))
    }
  }
}
