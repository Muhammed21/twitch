import Domain
import Foundation
import OpenAPIRuntime

public struct LiveDirectoryClient: LiveDirectory {
  private let client: Client

  public init(apiBaseURL: URL, transport: any HTTPTransport) {
    client = Client(apiBaseURL: apiBaseURL, transport: transport)
  }

  public func lives(after cursor: LiveCursor?) async throws -> LivePage {
    let output = try await unwrappingClientError {
      try await client.livesControllerList(query: .init(cursor: cursor?.rawValue))
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

extension LiveChannel {
  init?(_ live: Components.Schemas.Live) {
    guard let slug = try? ChannelSlug(live.slug) else { return nil }
    self.init(
      session: StreamSession(channelID: ChannelID(live.channelId), startedAt: live.startedAt),
      slug: slug,
      title: live.title,
      viewers: live.viewerCount.flatMap { try? ViewerCount($0) },
      thumbnailURL: live.thumbnailUrl.flatMap { URL(webAddress: $0) }
    )
  }
}
