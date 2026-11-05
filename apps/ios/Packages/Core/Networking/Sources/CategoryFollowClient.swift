import Domain
import Foundation
import OpenAPIRuntime

public struct CategoryFollowClient: CategoryFollowing {
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

  public func follow(_ category: CategorySlug) async throws {
    let output = try await unwrappingClientError {
      try await client.followedCategoriesControllerFollow(path: .init(slug: category.rawValue))
    }
    switch output {
    case .noContent: return
    case let .default(_, response): throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }

  public func unfollow(_ category: CategorySlug) async throws {
    let output = try await unwrappingClientError {
      try await client.followedCategoriesControllerUnfollow(path: .init(slug: category.rawValue))
    }
    switch output {
    case .noContent: return
    case let .default(_, response): throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }
}
