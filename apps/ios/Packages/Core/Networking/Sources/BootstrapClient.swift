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
        flags: FeatureFlags(sessionReplay: body.flags.sessionReplay),
        entitlements: body.entitlements.compactMap(Self.entitlement)
      )
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }

  private static func entitlement(_ entitlement: Components.Schemas.Entitlement) -> Entitlement? {
    switch entitlement.scope {
    case "platform": Entitlement(scope: .platform, expiresAt: entitlement.expiresAt)
    default: nil
    }
  }
}
