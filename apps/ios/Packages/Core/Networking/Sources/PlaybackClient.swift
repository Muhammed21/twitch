import Domain
import Foundation
import OpenAPIRuntime

public struct PlaybackClient: PlaybackSource {
  private static let offline = 404

  private let client: Client

  public init(apiBaseURL: URL, transport: any HTTPTransport) {
    client = Client(apiBaseURL: apiBaseURL, transport: transport)
  }

  public func playbackURL(for channel: ChannelID) async throws -> URL? {
    let output = try await unwrappingClientError {
      try await client.playbackControllerRead(path: .init(channelId: channel.rawValue))
    }
    switch output {
    case let .ok(response):
      let body = try response.body.json
      guard let url = URL(string: body.playbackUrl) else {
        throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "URL de lecture attendue"))
      }
      return url
    case let .default(statusCode, _) where statusCode == Self.offline:
      return nil
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }
}
