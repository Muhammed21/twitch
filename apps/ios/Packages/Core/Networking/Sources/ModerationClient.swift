import Domain
import Foundation
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
      middlewares: [BearerAuthentication(tokens: tokens, now: now)]
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
