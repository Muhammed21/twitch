import Domain
import Foundation
import OpenAPIRuntime

public enum APIError: Error, Equatable, Sendable {
  case unexpectedStatus(Int)
}

public struct AccountClient: AccountRepository {
  private let client: Client

  public init(
    apiBaseURL: URL,
    transport: any HTTPTransport,
    tokens: any AccessTokenProvider,
    now: @escaping @Sendable () -> Date
  ) {
    client = Client(
      serverURL: apiBaseURL,
      transport: TransportBridge(transport: transport),
      middlewares: [BearerAuthentication(tokens: tokens, now: now)]
    )
  }

  public func currentAccount() async throws -> Account {
    let output: Operations.MeControllerRead.Output
    do {
      output = try await client.meControllerRead()
    } catch let error as ClientError {
      throw error.underlyingError
    }
    switch output {
    case let .ok(response): return try Account(response.body.json)
    case let .default(status, _): throw APIError.unexpectedStatus(status)
    }
  }
}

extension Account {
  init(_ current: Components.Schemas.Me) {
    self.init(id: current.id, name: current.name, email: current.email)
  }
}
