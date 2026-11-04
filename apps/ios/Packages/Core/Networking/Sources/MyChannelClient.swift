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
      return try Self.streamKey(response.body.json)
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }

  public func rotateStreamKey(of channel: ChannelID) async throws -> StreamKey {
    let output = try await unwrappingClientError {
      try await client.streamKeyControllerRotate(path: .init(id: Self.pathID(channel)))
    }
    switch output {
    case let .ok(response):
      return try Self.streamKey(response.body.json)
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }

  public func update(_ channel: ChannelID, title: String, category: CategoryChange) async throws -> Channel {
    let body = Components.Schemas.UpdateChannelRequest(title: title, category: Self.choice(category))
    let output = try await unwrappingClientError {
      try await client.channelsControllerUpdate(path: .init(id: Self.pathID(channel)), body: .json(body))
    }
    switch output {
    case let .ok(response):
      return try Channel(response.body.json)
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }

  private static func choice(_ change: CategoryChange) -> Components.Schemas.CategoryChoice? {
    switch change {
    case .keep: nil
    case let .set(id): .init(id: id.rawValue)
    case .clear: .init()
    }
  }

  private static func streamKey(_ body: Components.Schemas.StreamKey) throws -> StreamKey {
    guard let ingestURL = URL(string: body.ingestUrl) else {
      throw ClientError.malformedIngestURL
    }
    return StreamKey(body.streamKey, ingestURL: ingestURL)
  }

  private static func pathID(_ channel: ChannelID) -> String {
    channel.rawValue.uuidString.lowercased()
  }

  private enum ClientError: Error {
    case malformedIngestURL
  }
}
