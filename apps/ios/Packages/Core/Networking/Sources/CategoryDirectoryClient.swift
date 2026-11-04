import Domain
import Foundation
import OpenAPIRuntime

public struct CategoryDirectoryClient: CategoryDirectory {
  private let client: Client

  public init(apiBaseURL: URL, transport: any HTTPTransport) {
    client = Client(apiBaseURL: apiBaseURL, transport: transport)
  }

  public func categories(after _: CategoryCursor?) async throws -> CategoryPage {
    let output = try await unwrappingClientError {
      try await client.categoriesControllerBrowse()
    }
    switch output {
    case let .ok(response):
      return try CategoryPage(categories: response.body.json.items.compactMap(BrowseCategory.init), nextCursor: nil)
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }
}

extension BrowseCategory {
  init?(_ category: Components.Schemas.BrowseCategory) {
    guard let slug = try? CategorySlug(category.slug) else { return nil }
    self.init(
      slug: slug,
      name: category.name,
      imageURL: category.imageUrl.flatMap(URL.init(string:)),
      liveCount: category.liveCount,
      viewers: category.viewerCount.flatMap { try? ViewerCount($0) }
    )
  }
}
