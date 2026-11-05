import Domain
import Foundation
import OpenAPIRuntime

public struct ProfileImagesClient: ProfileImages {
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

  public func setAvatar(_ upload: UploadID) async throws -> Account {
    let output = try await unwrappingClientError {
      try await client.meControllerAvatar(body: .json(.init(uploadId: upload.rawValue)))
    }
    switch output {
    case let .ok(response): return try Account(response.body.json)
    case let .default(_, response): throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }

  public func setBanner(_ upload: UploadID) async throws -> Channel {
    let output = try await unwrappingClientError {
      try await client.meBannerControllerBanner(body: .json(.init(uploadId: upload.rawValue)))
    }
    switch output {
    case let .ok(response): return try Channel(response.body.json)
    case let .default(_, response): throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }
}
