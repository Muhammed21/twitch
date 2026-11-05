import Domain
import Foundation
import OpenAPIRuntime

@MainActor
public final class ChatColorClient: ChatColorUpdating {
  private nonisolated let client: Client

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

  public nonisolated func setChatColor(_ hex: String?) async throws {
    let output = try await unwrappingClientError {
      try await client.meControllerChatColor(body: .json(.init(chatColor: hex)))
    }
    switch output {
    case .ok: return
    case let .default(_, response): throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }
}
