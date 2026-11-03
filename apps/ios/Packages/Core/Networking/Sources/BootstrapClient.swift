import Domain
import Foundation
import OpenAPIRuntime

public struct BootstrapClient: BootstrapSource {
  private let client: Client

  public init(apiBaseURL: URL, transport: any HTTPTransport) {
    client = Client(apiBaseURL: apiBaseURL, transport: transport)
  }

  public func bootstrap() async throws -> AppBootstrap {
    let output = try await unwrappingClientError { try await client.mobileBootstrapControllerRead() }
    switch output {
    case let .ok(response):
      let body = try response.body.json
      return try AppBootstrap(
        minSupportedVersion: AppVersion(body.minSupportedVersion),
        flags: FeatureFlags(sessionReplay: body.flags.sessionReplay)
      )
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }
}
