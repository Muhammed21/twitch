import Domain
import Foundation

public actor OAuthSession: AccessTokenProvider {
  public static let refreshMargin: TimeInterval = 60

  public nonisolated let statusUpdates: AsyncStream<SessionStatus>

  private let continuation: AsyncStream<SessionStatus>.Continuation
  private let endpoint: TokenEndpoint
  private let store: any TokenStore
  private var refreshInFlight: Task<TokenSet, any Error>?
  private var signOutInFlight: Task<Void, any Error>?

  public init(endpoint: TokenEndpoint, store: any TokenStore) {
    (statusUpdates, continuation) = AsyncStream.makeStream()
    self.endpoint = endpoint
    self.store = store
  }

  public func status() -> SessionStatus {
    (try? store.load()) == nil ? .signedOut : .signedIn
  }

  public func signIn(code: String, verifier: String, at now: Date) async throws {
    let tokens = try await endpoint.exchange(code: code, verifier: verifier, at: now)
    if let signOutInFlight { try? await signOutInFlight.value }
    try store.save(tokens)
    continuation.yield(.signedIn)
  }

  public func accessToken(at now: Date) async throws -> String {
    guard signOutInFlight == nil else { throw SessionError.signedOut }
    if let refreshInFlight { return try await refreshInFlight.value.accessToken }
    let tokens = try currentTokens()
    guard now < tokens.expiresAt.addingTimeInterval(-Self.refreshMargin) else {
      return try await refresh(tokens, at: now).accessToken
    }
    return tokens.accessToken
  }

  public func accessTokenRejected(_ token: String, at now: Date) async throws -> String {
    guard signOutInFlight == nil else { throw SessionError.signedOut }
    if let refreshInFlight { return try await refreshInFlight.value.accessToken }
    let tokens = try currentTokens()
    guard tokens.accessToken == token else { return tokens.accessToken }
    return try await refresh(tokens, at: now).accessToken
  }

  public func signOut() async throws {
    if let signOutInFlight { return try await signOutInFlight.value }
    let task = Task { try await revokeAndClear() }
    signOutInFlight = task
    defer { signOutInFlight = nil }
    try await task.value
  }

  private func revokeAndClear() async throws {
    if let refreshInFlight { _ = try? await refreshInFlight.value }
    if let tokens = try? store.load() {
      try? await endpoint.revoke(tokens.refreshToken)
    }
    try store.clear()
    continuation.yield(.signedOut)
  }

  private func currentTokens() throws -> TokenSet {
    guard let tokens = try store.load() else { throw SessionError.signedOut }
    return tokens
  }

  private func refresh(_ tokens: TokenSet, at now: Date) async throws -> TokenSet {
    let task = Task { try await rotate(tokens.refreshToken, at: now) }
    refreshInFlight = task
    defer { refreshInFlight = nil }
    return try await task.value
  }

  private func rotate(_ refreshToken: String, at now: Date) async throws -> TokenSet {
    do {
      let rotated = try await endpoint.refresh(refreshToken, at: now)
      try store.save(rotated)
      return rotated
    } catch TokenEndpointError.invalidGrant {
      try store.clear()
      continuation.yield(.signedOut)
      throw SessionError.signedOut
    }
  }
}
