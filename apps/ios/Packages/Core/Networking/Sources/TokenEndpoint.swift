import Foundation

public struct TokenSet: Codable, Equatable, Sendable {
  public let accessToken: String
  public let refreshToken: String
  public let expiresAt: Date

  public init(accessToken: String, refreshToken: String, expiresAt: Date) {
    self.accessToken = accessToken
    self.refreshToken = refreshToken
    self.expiresAt = expiresAt
  }
}

public enum TokenEndpointError: Error, Equatable, Sendable {
  case invalidGrant
  case rejected(status: Int, code: String?)
  case malformedResponse
}

public struct TokenEndpoint: Sendable {
  private static let formUnreserved = CharacterSet(
    charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
  )

  private let configuration: OAuthConfiguration
  private let transport: any HTTPTransport

  public init(configuration: OAuthConfiguration, transport: any HTTPTransport) {
    self.configuration = configuration
    self.transport = transport
  }

  public func exchange(code: String, verifier: String, at now: Date) async throws -> TokenSet {
    try await requestTokens([
      ("grant_type", "authorization_code"),
      ("code", code),
      ("redirect_uri", OAuthConfiguration.redirectURI.absoluteString),
      ("client_id", configuration.clientID),
      ("code_verifier", verifier),
      ("resource", configuration.resource),
    ], at: now)
  }

  public func refresh(_ refreshToken: String, at now: Date) async throws -> TokenSet {
    try await requestTokens([
      ("grant_type", "refresh_token"),
      ("refresh_token", refreshToken),
      ("client_id", configuration.clientID),
      ("resource", configuration.resource),
    ], at: now)
  }

  public func revoke(_ refreshToken: String) async throws {
    let response = try await post(to: configuration.revocationEndpoint, form: [
      ("token", refreshToken),
      ("token_type_hint", "refresh_token"),
      ("client_id", configuration.clientID),
    ])
    guard response.status == 200 else { throw Self.failure(of: response) }
  }

  private func requestTokens(_ form: [(String, String)], at now: Date) async throws -> TokenSet {
    let response = try await post(to: configuration.tokenEndpoint, form: form)
    guard response.status == 200 else { throw Self.failure(of: response) }
    guard let body = try? JSONDecoder().decode(TokenBody.self, from: response.body),
          body.tokenType.lowercased() == "bearer"
    else { throw TokenEndpointError.malformedResponse }
    return TokenSet(
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      expiresAt: now.addingTimeInterval(TimeInterval(body.expiresIn))
    )
  }

  private func post(to url: URL, form: [(String, String)]) async throws -> HTTPResponse {
    let body = form
      .map { name, value in "\(Self.formEncode(name))=\(Self.formEncode(value))" }
      .joined(separator: "&")
    return try await transport.send(HTTPRequest(
      method: "POST",
      url: url,
      headers: ["Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"],
      body: Data(body.utf8)
    ))
  }

  private static func formEncode(_ value: String) -> String {
    value.addingPercentEncoding(withAllowedCharacters: formUnreserved) ?? value
  }

  private static func failure(of response: HTTPResponse) -> TokenEndpointError {
    let code = (try? JSONDecoder().decode(ErrorBody.self, from: response.body))?.error
    return code == "invalid_grant" ? .invalidGrant : .rejected(status: response.status, code: code)
  }
}

private struct TokenBody: Decodable {
  let accessToken: String
  let refreshToken: String
  let expiresIn: Int
  let tokenType: String

  enum CodingKeys: String, CodingKey {
    case accessToken = "access_token"
    case refreshToken = "refresh_token"
    case expiresIn = "expires_in"
    case tokenType = "token_type"
  }
}

private struct ErrorBody: Decodable {
  let error: String
}
