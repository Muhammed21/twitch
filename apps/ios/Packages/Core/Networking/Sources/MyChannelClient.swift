import Domain
import Foundation
import OpenAPIRuntime

public struct MyChannelClient: MyChannelRepository {
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

  public func ownedChannel() async throws -> OwnedChannel? {
    let output = try await unwrappingClientError { try await client.mobileBootstrapControllerRead() }
    switch output {
    case let .ok(response):
      guard let channel = try response.body.json.profile?.channel else {
        return nil
      }
      return try OwnedChannel(id: ChannelID(channel.id), slug: ChannelSlug(channel.slug))
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }

  public func streamKey(of channel: ChannelID) async throws -> StreamKey {
    let output = try await unwrappingClientError {
      try await client.streamKeyControllerRead(path: .init(id: Self.pathID(channel)))
    }
    switch output {
    case let .ok(response):
      let body = try response.body.json
      guard let ingestURL = URL(string: body.ingestUrl) else {
        throw ClientError.malformedIngestURL
      }
      return StreamKey(body.streamKey, ingestURL: ingestURL)
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }

  public func rename(_ channel: ChannelID, to title: String) async throws -> Channel {
    let output = try await unwrappingClientError {
      try await client.channelsControllerUpdate(path: .init(id: Self.pathID(channel)), body: .json(.init(title: title)))
    }
    switch output {
    case let .ok(response):
      let body = try response.body.json
      return try Channel(id: ChannelID(body.id), slug: ChannelSlug(body.slug), title: body.title, ownerID: body.ownerId)
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }

  private static func pathID(_ channel: ChannelID) -> String {
    channel.rawValue.uuidString.lowercased()
  }

  private enum ClientError: Error {
    case malformedIngestURL
  }
}
