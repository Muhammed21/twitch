import Domain
import Foundation
import OpenAPIRuntime

public struct CategoryCatalogClient: CategoryCatalog {
  private let client: Client

  public init(apiBaseURL: URL, transport: any HTTPTransport) {
    client = Client(apiBaseURL: apiBaseURL, transport: transport)
  }

  public func categories(matching query: String) async throws -> [ChannelCategory] {
    let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
    let output = try await unwrappingClientError {
      try await client.categoryCatalogControllerRead(query: .init(q: text.isEmpty ? nil : text))
    }
    switch output {
    case let .ok(response):
      return try response.body.json.categories.map(ChannelCategory.init)
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }
}
