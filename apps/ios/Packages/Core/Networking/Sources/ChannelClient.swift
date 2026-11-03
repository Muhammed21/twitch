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
      let body = try response.body.json
      return try Channel(id: ChannelID(body.id), slug: ChannelSlug(body.slug), title: body.title, ownerID: body.ownerId)
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }
}
