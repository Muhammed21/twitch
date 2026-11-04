import Domain
import Foundation
import OpenAPIRuntime

public struct CategoryDirectoryClient: CategoryDirectory {
  private let client: Client

  public init(apiBaseURL: URL, transport: any HTTPTransport) {
    client = Client(apiBaseURL: apiBaseURL, transport: transport)
  }

  public func categories(after cursor: CategoryCursor?) async throws -> CategoryPage {
    let output = try await unwrappingClientError {
      try await client.categoriesControllerBrowse(query: .init(cursor: cursor?.rawValue))
    }
    switch output {
    case let .ok(response):
      let body = try response.body.json
      return CategoryPage(
        categories: body.items.compactMap(BrowseCategory.init),
        nextCursor: body.nextCursor.map(CategoryCursor.init)
      )
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
      viewers: try? ViewerCount(category.viewerCount)
    )
  }
}
