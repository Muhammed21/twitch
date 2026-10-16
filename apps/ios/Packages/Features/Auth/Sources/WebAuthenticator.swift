import Foundation

public enum WebAuthenticationError: Error, Equatable, Sendable {
  case canceled
  case unavailable
}

@MainActor
public protocol WebAuthenticator {
  func authenticate(at url: URL, callbackScheme: String) async throws -> URL
}
