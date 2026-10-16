import Domain
import Foundation
import Networking
import Observation

public enum SessionPhase: Equatable, Sendable {
  case launching
  case signedOut
  case signingIn
  case signedIn(Account?)
}

public enum LogOutChoice: Equatable, Sendable {
  case logOut
  case cancel
}

@MainActor
@Observable
public final class SessionStore {
  public private(set) var phase: SessionPhase = .launching
  public private(set) var hasSignInFailure = false
  public private(set) var hasLogOutFailure = false

  private let configuration: OAuthConfiguration
  private let session: OAuthSession
  private let accounts: any AccountRepository
  private let authenticator: any WebAuthenticator
  private let randomBytes: PKCE.RandomBytes
  private let now: @Sendable () -> Date

  public init(
    configuration: OAuthConfiguration,
    session: OAuthSession,
    accounts: any AccountRepository,
    authenticator: any WebAuthenticator,
    randomBytes: @escaping PKCE.RandomBytes,
    now: @escaping @Sendable () -> Date
  ) {
    self.configuration = configuration
    self.session = session
    self.accounts = accounts
    self.authenticator = authenticator
    self.randomBytes = randomBytes
    self.now = now
  }

  public func run() async {
    let isSignedIn = await session.status() == .signedIn
    phase = isSignedIn ? .signedIn(nil) : .signedOut
    async let following: Void = follow()
    if isSignedIn { await loadAccount() }
    await following
  }

  public func signIn(_ intent: AuthorizationIntent) async {
    guard phase == .signedOut else { return }
    phase = .signingIn
    let attempt = AuthorizationAttempt(configuration: configuration, intent: intent, randomBytes: randomBytes)
    do {
      let callback = try await authenticator.authenticate(at: attempt.url, callbackScheme: OAuthConfiguration.callbackScheme)
      let code = try attempt.authorizationCode(from: callback)
      try await session.signIn(code: code, verifier: attempt.pkce.verifier, at: now())
    } catch WebAuthenticationError.canceled {
      phase = .signedOut
      return
    } catch {
      phase = .signedOut
      hasSignInFailure = true
      return
    }
    phase = .signedIn(nil)
    await loadAccount()
  }

  public func resolveLogOut(_ choice: LogOutChoice) async {
    guard choice == .logOut else { return }
    do {
      try await session.signOut()
    } catch {
      hasLogOutFailure = true
    }
  }

  public func dismissSignInFailure() {
    hasSignInFailure = false
  }

  public func dismissLogOutFailure() {
    hasLogOutFailure = false
  }

  private func follow() async {
    for await status in session.statusUpdates where status == .signedOut {
      phase = .signedOut
    }
  }

  private func loadAccount() async {
    do {
      let account = try await accounts.currentAccount()
      guard case .signedIn = phase else { return }
      phase = .signedIn(account)
    } catch SessionError.signedOut {
      try? await session.signOut()
    } catch {
      return
    }
  }
}
