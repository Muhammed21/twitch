import Domain
import Foundation
import OpenAPIRuntime

public struct CategoryLivesClient: CategoryLives {
  private let client: Client

  public init(apiBaseURL: URL, transport: any HTTPTransport) {
    client = Client(apiBaseURL: apiBaseURL, transport: transport)
  }

  public func lives(in category: CategorySlug, after cursor: LiveCursor?) async throws -> LivePage {
    let output = try await unwrappingClientError {
      try await client.categoriesControllerLives(
        path: .init(slug: category.rawValue),
        query: .init(cursor: cursor?.rawValue)
      )
    }
    switch output {
    case let .ok(response):
      let body = try response.body.json
      return LivePage(lives: body.items.compactMap(LiveChannel.init), nextCursor: body.nextCursor.map(LiveCursor.init))
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }
}
