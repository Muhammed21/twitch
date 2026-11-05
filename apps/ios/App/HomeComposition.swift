import Foundation
import Home
import Networking

extension Composition {
  static func categoryHeaders(
    apiBaseURL: URL,
    transport: ClientVersionTransport,
    tokens: OAuthSession,
    now: @escaping @Sendable () -> Date
  ) -> CategoryHeaderCatalog {
    CategoryHeaderCatalog(
      details: CategoryDetailClient(apiBaseURL: apiBaseURL, transport: transport, tokens: tokens, now: now),
      following: CategoryFollowClient(apiBaseURL: apiBaseURL, transport: transport, tokens: tokens, now: now),
      now: now
    )
  }
}
