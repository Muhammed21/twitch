import Domain
import Foundation
import HTTPTypes
import OpenAPIRuntime

struct BearerAuthentication: ClientMiddleware {
  let tokens: any AccessTokenProvider
  let now: @Sendable () -> Date

  func intercept(
    _ request: HTTPTypes.HTTPRequest,
    body: HTTPBody?,
    baseURL: URL,
    operationID _: String,
    next: @Sendable (HTTPTypes.HTTPRequest, HTTPBody?, URL) async throws -> (HTTPTypes.HTTPResponse, HTTPBody?)
  ) async throws -> (HTTPTypes.HTTPResponse, HTTPBody?) {
    let token = try await tokens.accessToken(at: now())
    let first = try await next(Self.authorize(request, with: token), body, baseURL)
    guard first.0.status == .unauthorized else { return first }
    let renewed = try await tokens.accessTokenRejected(token, at: now())
    let second = try await next(Self.authorize(request, with: renewed), body, baseURL)
    guard second.0.status == .unauthorized else { return second }
    throw SessionError.signedOut
  }

  private static func authorize(_ request: HTTPTypes.HTTPRequest, with token: String) -> HTTPTypes.HTTPRequest {
    var authorized = request
    authorized.headerFields[.authorization] = "Bearer \(token)"
    return authorized
  }
}
