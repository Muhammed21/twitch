import Domain
import Foundation
import HTTPTypes
import OpenAPIRuntime

public struct ModerationClient: ChatModeration {
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
      middlewares: [BearerAuthentication(tokens: tokens, now: now), LowercasedUserId()]
    )
  }

  public func timeout(_ user: UUID, in channel: ChannelID, for duration: Duration) async throws {
    let output = try await unwrappingClientError {
      try await client.timeoutsControllerCreate(
        path: .init(id: channel.rawValue.uuidString.lowercased()),
        body: .json(.init(userId: user, durationSeconds: Int(duration.components.seconds)))
      )
    }
    switch output {
    case .created: return
    case let .default(_, response): throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }
}

private struct LowercasedUserId: ClientMiddleware {
  func intercept(
    _ request: HTTPTypes.HTTPRequest,
    body: HTTPBody?,
    baseURL: URL,
    operationID _: String,
    next: @Sendable (HTTPTypes.HTTPRequest, HTTPBody?, URL) async throws -> (HTTPTypes.HTTPResponse, HTTPBody?)
  ) async throws -> (HTTPTypes.HTTPResponse, HTTPBody?) {
    guard let body else { return try await next(request, nil, baseURL) }
    let sent = try await Data(collecting: body, upTo: 4096)
    guard
      var json = try JSONSerialization.jsonObject(with: sent) as? [String: Any],
      let userId = json["userId"] as? String
    else { return try await next(request, HTTPBody(sent), baseURL) }
    json["userId"] = userId.lowercased()
    return try await next(request, HTTPBody(JSONSerialization.data(withJSONObject: json)), baseURL)
  }
}
