import Auth
import DesignSystem
import Foundation
import Networking
import Onboarding
import SwiftUI

@main
struct TwitchApp: App {
  @State private var session = Composition.sessionStore(info: Bundle.main.infoDictionary ?? [:])

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(session)
    }
  }
}

enum RootScreen: Equatable {
  case splash
  case welcome
  case allSet
  case signedIn

  init(isSplashVisible: Bool, phase: SessionPhase, isGreetingNewAccount: Bool) {
    switch (isSplashVisible, phase) {
    case (true, _), (false, .launching): self = .splash
    case (false, .signedOut), (false, .signingIn): self = .welcome
    case (false, .signedIn): self = isGreetingNewAccount ? .allSet : .signedIn
    }
  }
}

extension AuthorizationIntent {
  init(_ intent: WelcomeIntent) {
    switch intent {
    case .logIn: self = .signIn
    case .signUp: self = .signUp
    }
  }
}

struct RootView: View {
  @Environment(SessionStore.self) private var session
  @State private var isSplashVisible = true

  var body: some View {
    screen
      .signInFailureAlert(session)
      .logOutFailureAlert(session)
      .task { await session.run() }
  }

  @ViewBuilder private var screen: some View {
    switch RootScreen(isSplashVisible: isSplashVisible, phase: session.phase, isGreetingNewAccount: session.isGreetingNewAccount) {
    case .splash:
      ZStack {
        ColorRole.accent.color.ignoresSafeArea()
        SplashScreen { isSplashVisible = false }
      }
    case .welcome:
      WelcomeScreen { intent in
        Task { await session.signIn(AuthorizationIntent(intent)) }
      }
    case .allSet:
      AllSetScreen()
    case .signedIn:
      SignedInScreen()
    }
  }
}

@MainActor
enum Composition {
  static func sessionStore(info: [String: Any]) -> SessionStore {
    let configuration: OAuthConfiguration
    do {
      configuration = try OAuthConfiguration(infoDictionary: info)
    } catch {
      fatalError("Info.plist : configuration OAuth invalide (\(error)).")
    }
    let transport = URLSessionHTTPTransport()
    let session = OAuthSession(
      endpoint: TokenEndpoint(configuration: configuration, transport: transport),
      store: KeychainTokenStore(service: Bundle.main.bundleIdentifier ?? "com.muhammedcavus.twitch")
    )
    let now: @Sendable () -> Date = { Date.now }
    return SessionStore(
      configuration: configuration,
      session: session,
      accounts: AccountClient(apiBaseURL: configuration.apiBaseURL, transport: transport, tokens: session, now: now),
      authenticator: SystemWebAuthenticator(),
      randomBytes: PKCE.systemRandomBytes,
      now: now
    )
  }
}
