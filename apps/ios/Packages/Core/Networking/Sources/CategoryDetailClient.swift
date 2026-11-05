import Domain
import Foundation
import HTTPTypes
import OpenAPIRuntime

public struct CategoryDetailClient: CategoryDetails {
  private let client: Client

  public init(
    apiBaseURL: URL,
    transport: any HTTPTransport,
    tokens: any AccessTokenProvider,
    now: @escaping @Sendable () -> Date
  ) {
    client = Client(
      apiBaseURL: apiBaseURL,
      transport: transport,
      middlewares: [OptionalBearerAuthentication(tokens: tokens, now: now)]
    )
  }

  public func detail(of category: CategorySlug) async throws -> CategoryDetail {
    let output = try await unwrappingClientError {
      try await client.categoriesControllerHeader(path: .init(slug: category.rawValue))
    }
    switch output {
    case let .ok(response):
      let body = try response.body.json
      return CategoryDetail(tags: body.tags, followers: body.followerCount, isFollowing: body.isFollowing)
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }
}

struct OptionalBearerAuthentication: ClientMiddleware {
  let tokens: any AccessTokenProvider
  let now: @Sendable () -> Date

  func intercept(
    _ request: HTTPTypes.HTTPRequest,
    body: HTTPBody?,
    baseURL: URL,
    operationID _: String,
    next: @Sendable (HTTPTypes.HTTPRequest, HTTPBody?, URL) async throws -> (HTTPTypes.HTTPResponse, HTTPBody?)
  ) async throws -> (HTTPTypes.HTTPResponse, HTTPBody?) {
    guard let token = try await signedIn({ try await tokens.accessToken(at: now()) }) else {
      return try await next(request, body, baseURL)
    }
    let first = try await next(Self.authorize(request, with: token), body, baseURL)
    guard first.0.status == .unauthorized else { return first }
    guard let renewed = try await signedIn({ try await tokens.accessTokenRejected(token, at: now()) }) else {
      return try await next(request, body, baseURL)
    }
    let second = try await next(Self.authorize(request, with: renewed), body, baseURL)
    guard second.0.status == .unauthorized else { return second }
    return try await next(request, body, baseURL)
  }

  private func signedIn(_ token: () async throws -> String) async throws -> String? {
    do {
      return try await token()
    } catch SessionError.signedOut {
      return nil
    }
  }

  private static func authorize(_ request: HTTPTypes.HTTPRequest, with token: String) -> HTTPTypes.HTTPRequest {
    var authorized = request
    authorized.headerFields[.authorization] = "Bearer \(token)"
    return authorized
  }
}
