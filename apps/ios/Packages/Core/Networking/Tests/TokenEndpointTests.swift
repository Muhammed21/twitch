import Foundation
import Networking
import Testing

private let now = Date(timeIntervalSince1970: 1_800_000_000)

private func endpoint(_ transport: FakeTransport) -> TokenEndpoint {
  TokenEndpoint(configuration: devConfiguration, transport: transport)
}

private func onlyRequest(_ transport: FakeTransport) async throws -> HTTPRequest {
  let requests = await transport.requests
  try #require(requests.count == 1)
  return requests[0]
}

@Suite("Client du token endpoint")
struct TokenEndpointTests {
  @Test("échange le code contre des tokens par un POST form-urlencoded portant le verifier et la ressource")
  func exchange() async throws {
    let transport = FakeTransport(json: tokenJSON())

    let tokens = try await endpoint(transport).exchange(code: "code-1", verifier: "verifier-1", at: now)

    let request = try await onlyRequest(transport)
    #expect(request.method == "POST")
    #expect(request.url == tokenURL)
    #expect(request.headers["Content-Type"] == "application/x-www-form-urlencoded")
    #expect(request.headers["Accept"] == "application/json")
    #expect(form(of: request) == [
      "grant_type": "authorization_code",
      "code": "code-1",
      "redirect_uri": "twitch://oauth/callback",
      "client_id": "twitch-ios-dev",
      "code_verifier": "verifier-1",
      "resource": "http://127.0.0.1:3000/v1",
    ])
    #expect(tokens == TokenSet(accessToken: "access-1", refreshToken: "refresh-1", expiresAt: now + 900))
  }

  @Test("rafraîchit avec le refresh token, le client_id et la ressource")
  func refresh() async throws {
    let transport = FakeTransport(json: tokenJSON(access: "access-2", refresh: "refresh-2", expiresIn: 600))

    let tokens = try await endpoint(transport).refresh("refresh-1", at: now)

    let request = try await onlyRequest(transport)
    #expect(request.url == tokenURL)
    #expect(form(of: request) == [
      "grant_type": "refresh_token",
      "refresh_token": "refresh-1",
      "client_id": "twitch-ios-dev",
      "resource": "http://127.0.0.1:3000/v1",
    ])
    #expect(tokens == TokenSet(accessToken: "access-2", refreshToken: "refresh-2", expiresAt: now + 600))
  }

  @Test("encode les caractères réservés du corps de formulaire")
  func formEncoding() async throws {
    let transport = FakeTransport(json: tokenJSON())

    _ = try await endpoint(transport).refresh("a+b/c=d&e f", at: now)

    let body = try await String(bytes: onlyRequest(transport).body, encoding: .utf8)
    #expect(body?.contains("refresh_token=a%2Bb%2Fc%3Dd%26e%20f") == true)
  }

  @Test("ignore les champs inconnus et lit token_type sans tenir compte de la casse",
        arguments: ["Bearer", "bearer", "BEARER"])
  func tolerantDecoding(tokenType: String) async throws {
    let json = #"{"access_token":"a","refresh_token":"r","expires_in":900,"token_type":"\#(tokenType)","scope":"openid","id_token":"x"}"#

    let tokens = try await endpoint(FakeTransport(json: json)).refresh("refresh-1", at: now)

    #expect(tokens == TokenSet(accessToken: "a", refreshToken: "r", expiresAt: now + 900))
  }

  @Test("refuse une réponse sans token, sans durée, ou d'un autre type que Bearer", arguments: [
    #"{"refresh_token":"r","expires_in":900,"token_type":"Bearer"}"#,
    #"{"access_token":"a","expires_in":900,"token_type":"Bearer"}"#,
    #"{"access_token":"a","refresh_token":"r","token_type":"Bearer"}"#,
    #"{"access_token":"a","refresh_token":"r","expires_in":900,"token_type":"DPoP"}"#,
    "pas du json",
  ])
  func malformed(json: String) async {
    await #expect(throws: TokenEndpointError.malformedResponse) {
      try await endpoint(FakeTransport(json: json)).refresh("refresh-1", at: now)
    }
  }

  @Test("traduit invalid_grant en erreur dédiée")
  func invalidGrant() async {
    let transport = FakeTransport(status: 400, json: #"{"error":"invalid_grant","error_description":"..."}"#)

    await #expect(throws: TokenEndpointError.invalidGrant) {
      try await endpoint(transport).refresh("refresh-1", at: now)
    }
  }

  @Test("remonte le statut et le code des autres refus", arguments: [
    (400, #"{"error":"invalid_request"}"#, TokenEndpointError.rejected(status: 400, code: "invalid_request")),
    (503, "indisponible", TokenEndpointError.rejected(status: 503, code: nil)),
  ])
  func otherFailures(status: Int, json: String, expected: TokenEndpointError) async {
    await #expect(throws: expected) {
      try await endpoint(FakeTransport(status: status, json: json)).refresh("refresh-1", at: now)
    }
  }

  @Test("révoque le refresh token sur l'endpoint revoke")
  func revoke() async throws {
    let transport = FakeTransport(json: "{}")

    try await endpoint(transport).revoke("refresh-1")

    let request = try await onlyRequest(transport)
    #expect(request.method == "POST")
    #expect(request.url == revokeURL)
    #expect(request.headers["Content-Type"] == "application/x-www-form-urlencoded")
    #expect(form(of: request) == [
      "token": "refresh-1",
      "token_type_hint": "refresh_token",
      "client_id": "twitch-ios-dev",
    ])
  }

  @Test("signale une révocation refusée")
  func revokeRefused() async {
    let transport = FakeTransport(status: 400, json: #"{"error":"unsupported_token_type"}"#)

    await #expect(throws: TokenEndpointError.rejected(status: 400, code: "unsupported_token_type")) {
      try await endpoint(transport).revoke("refresh-1")
    }
  }
}
