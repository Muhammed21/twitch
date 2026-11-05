import Domain
import Foundation
import OpenAPIRuntime

public struct ChannelClient: ChannelRepository {
  private let client: Client

  public init(apiBaseURL: URL, transport: any HTTPTransport) {
    client = Client(apiBaseURL: apiBaseURL, transport: transport)
  }

  public func channel(withSlug slug: ChannelSlug) async throws -> Channel {
    let output = try await unwrappingClientError {
      try await client.channelsControllerRead(path: .init(slug: slug.rawValue))
    }
    switch output {
    case let .ok(response):
      return try Channel(response.body.json)
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }
}

extension Channel {
  init(_ body: Components.Schemas.Channel) throws {
    try self.init(
      id: ChannelID(body.id),
      slug: ChannelSlug(body.slug),
      title: body.title,
      ownerID: body.ownerId,
      category: body.category.map(ChannelCategory.init)
    )
  }
}

extension ChannelCategory {
  init(_ summary: Components.Schemas.CategorySummary) {
    self.init(id: CategoryID(summary.id), name: summary.name, imageURL: summary.imageUrl.flatMap { URL(webAddress: $0) })
  }
}
