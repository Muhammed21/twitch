import Domain
import Foundation
import OpenAPIRuntime

public struct CategoryTagClient: CategoryTagDirectory {
  private let client: Client

  public init(apiBaseURL: URL, transport: any HTTPTransport) {
    client = Client(apiBaseURL: apiBaseURL, transport: transport)
  }

  public func tags() async throws -> [InterestTag] {
    let output = try await unwrappingClientError {
      try await client.tagsControllerList()
    }
    switch output {
    case let .ok(response):
      return try response.body.json.items.map { InterestTag(name: $0.name, categoryCount: $0.categoryCount) }
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }
}
