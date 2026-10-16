import Foundation

public enum SessionStatus: Equatable, Sendable {
  case signedIn
  case signedOut
}

public enum SessionError: Error, Equatable, Sendable {
  case signedOut
}

public protocol AccessTokenProvider: Sendable {
  func accessToken(at now: Date) async throws -> String
  func accessTokenRejected(_ token: String, at now: Date) async throws -> String
}
