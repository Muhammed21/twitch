import Domain
import Foundation
import HTTPTypes
import OpenAPIRuntime

public struct BootstrapClient: BootstrapSource {
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
      middlewares: [SignedInAuthentication(bearer: BearerAuthentication(tokens: tokens, now: now))]
    )
  }

  public func bootstrap() async throws -> AppBootstrap {
    let output = try await unwrappingClientError { try await client.mobileBootstrapControllerRead() }
    switch output {
    case let .ok(response):
      let body = try response.body.json
      return try AppBootstrap(
        minSupportedVersion: AppVersion(body.minSupportedVersion),
        flags: FeatureFlags(sessionReplay: body.flags.sessionReplay, paywallVariant: body.flags.expPaywallVariant)
      )
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }
}

struct SignedInAuthentication: ClientMiddleware {
  let bearer: BearerAuthentication

  func intercept(
    _ request: HTTPTypes.HTTPRequest,
    body: HTTPBody?,
    baseURL: URL,
    operationID: String,
    next: @Sendable (HTTPTypes.HTTPRequest, HTTPBody?, URL) async throws -> (HTTPTypes.HTTPResponse, HTTPBody?)
  ) async throws -> (HTTPTypes.HTTPResponse, HTTPBody?) {
    do {
      return try await bearer.intercept(request, body: body, baseURL: baseURL, operationID: operationID, next: next)
    } catch SessionError.signedOut {
      return try await next(request, body, baseURL)
    }
  }
}
