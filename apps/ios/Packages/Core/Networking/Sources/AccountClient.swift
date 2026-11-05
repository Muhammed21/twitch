import Domain
import Foundation
import OpenAPIRuntime

public struct AccountClient: AccountRepository, ProfileEditor {
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

  public func currentAccount() async throws -> Account {
    let output = try await unwrappingClientError { try await client.meControllerRead() }
    switch output {
    case let .ok(response): return try Account(response.body.json)
    case let .default(_, response): throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }

  public func updateBio(_ bio: String) async throws -> Account {
    let output = try await unwrappingClientError { try await client.meControllerUpdate(body: .json(.init(bio: bio))) }
    switch output {
    case let .ok(response): return try Account(response.body.json)
    case let .default(_, response): throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }
}

extension Account {
  init(_ current: Components.Schemas.Me) {
    self.init(
      id: current.id,
      name: current.name,
      email: current.email,
      bio: current.bio,
      lastLiveAt: current.lastLiveAt,
      avatarURL: current.avatarUrl.flatMap { URL(webAddress: $0) },
      chatColor: current.chatColor
    )
  }
}
