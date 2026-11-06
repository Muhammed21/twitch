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
  public private(set) var hasAccountLoadFailure = false
  public private(set) var isGreetingNewAccount = false
  public private(set) var isPersonalizing = false

  public var accountID: UUID? {
    guard case let .signedIn(account) = phase else {
      return nil
    }
    return account?.id
  }

  private let configuration: OAuthConfiguration
  private let session: OAuthSession
  private let accounts: any AccountRepository
  private let authenticator: any WebAuthenticator
  private let randomBytes: PKCE.RandomBytes
  private let now: @Sendable () -> Date
  private let analytics: any Analytics & AnalyticsIdentity
  private var isLoggingOut = false

  public init(
    configuration: OAuthConfiguration,
    session: OAuthSession,
    accounts: any AccountRepository,
    authenticator: any WebAuthenticator,
    randomBytes: @escaping PKCE.RandomBytes,
    now: @escaping @Sendable () -> Date,
    analytics: any Analytics & AnalyticsIdentity
  ) {
    self.configuration = configuration
    self.session = session
    self.accounts = accounts
    self.authenticator = authenticator
    self.randomBytes = randomBytes
    self.now = now
    self.analytics = analytics
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
    isGreetingNewAccount = intent == .signUp
    isPersonalizing = intent == .signUp
    await loadAccount()
    guard case .signedIn = phase else { return }
    analytics.capture(intent == .signUp ? .accountSignedUp : .accountSignedIn)
  }

  public func resolveLogOut(_ choice: LogOutChoice) async {
    guard choice == .logOut else { return }
    isLoggingOut = true
    do {
      try await session.signOut()
    } catch {
      isLoggingOut = false
      hasLogOutFailure = true
    }
  }

  public func finishGreeting() {
    isGreetingNewAccount = false
  }

  public func finishPersonalization() {
    isPersonalizing = false
  }

  public func dismissSignInFailure() {
    hasSignInFailure = false
  }

  public func dismissLogOutFailure() {
    hasLogOutFailure = false
  }

  public func accountSaved(_ account: Account) {
    guard case .signedIn = phase else { return }
    phase = .signedIn(account)
  }

  public func reloadAccount() async {
    guard phase == .signedIn(nil) else { return }
    await loadAccount()
  }

  private func follow() async {
    for await status in session.statusUpdates where status == .signedOut {
      if isLoggingOut {
        analytics.capture(.accountSignedOut)
        isLoggingOut = false
      }
      analytics.reset()
      phase = .signedOut
      hasAccountLoadFailure = false
      isGreetingNewAccount = false
      isPersonalizing = false
    }
  }

  private func loadAccount() async {
    do {
      let account = try await accounts.currentAccount()
      guard case .signedIn = phase else { return }
      analytics.identify(account.id)
      phase = .signedIn(account)
      hasAccountLoadFailure = false
    } catch SessionError.signedOut {
      try? await session.signOut()
    } catch {
      hasAccountLoadFailure = true
    }
  }
}
