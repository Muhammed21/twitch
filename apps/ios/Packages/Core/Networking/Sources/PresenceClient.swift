import Domain
import Foundation
import HTTPTypes
import OpenAPIRuntime

public struct PresenceClient: PresenceReporter {
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
      middlewares: [LowercasedPath(), BearerAuthentication(tokens: tokens, now: now)]
    )
  }

  public func reportPresence(in channel: ChannelID) async throws {
    let output = try await unwrappingClientError {
      try await client.presenceControllerRecord(path: .init(channelId: channel.rawValue), body: .json(.init()))
    }
    switch output {
    case .noContent: return
    case let .default(_, response): throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }
}

private struct LowercasedPath: ClientMiddleware {
  func intercept(
    _ request: HTTPTypes.HTTPRequest,
    body: HTTPBody?,
    baseURL: URL,
    operationID _: String,
    next: @Sendable (HTTPTypes.HTTPRequest, HTTPBody?, URL) async throws -> (HTTPTypes.HTTPResponse, HTTPBody?)
  ) async throws -> (HTTPTypes.HTTPResponse, HTTPBody?) {
    var lowercased = request
    lowercased.path = request.path?.lowercased()
    return try await next(lowercased, body, baseURL)
  }
}
