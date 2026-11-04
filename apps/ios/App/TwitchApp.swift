import Auth
import Channel
import Chat
import ChatTransport
import DesignSystem
import Domain
import Foundation
import Home
import Navigation
import Networking
import Onboarding
import Player
import SwiftUI

@main
struct TwitchApp: App {
  @State private var stores = Composition.stores(info: Bundle.main.infoDictionary ?? [:])

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(stores.session)
        .environment(stores.launch)
        .environment(stores.home)
        .environment(stores.router)
        .environment(stores.player)
        .environment(stores.channelPlayback)
        .environment(stores.liveStatus)
        .environment(stores.chat)
    }
  }
}

enum RootScreen: Equatable {
  case splash
  case welcome
  case allSet
  case signedIn
  case updateRequired

  init(isSplashVisible: Bool, phase: SessionPhase, isGreetingNewAccount: Bool, isUpdateRequired: Bool) {
    switch (isSplashVisible, phase) {
    case (true, _): self = .splash
    case (false, _) where isUpdateRequired: self = .updateRequired
    case (false, .launching): self = .splash
    case (false, .signedOut), (false, .signingIn): self = .welcome
    case (false, .signedIn): self = isGreetingNewAccount ? .allSet : .signedIn
    }
  }

  static func resetsNavigation(from old: SessionPhase, to new: SessionPhase) -> Bool {
    switch (old, new) {
    case (.signedIn, .signedIn): false
    case (.signedIn, _): true
    default: false
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
  @Environment(LaunchStore.self) private var launch
  @Environment(Router.self) private var router
  @State private var isSplashVisible = true

  var body: some View {
    screen
      .signInFailureAlert(session)
      .logOutFailureAlert(session)
      .onOpenURL { router.open($0) }
      .onChange(of: session.phase) { old, new in
        if RootScreen.resetsNavigation(from: old, to: new) { router.reset() }
      }
      .task { await launch.run() }
      .task { await session.run() }
  }

  @ViewBuilder private var screen: some View {
    switch RootScreen(
      isSplashVisible: isSplashVisible,
      phase: session.phase,
      isGreetingNewAccount: session.isGreetingNewAccount,
      isUpdateRequired: launch.isUpdateRequired
    ) {
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
      SignedInRoot()
    case .updateRequired:
      UpdateRequiredScreen()
    }
  }
}

struct SignedInRoot: View {
  @Environment(Router.self) private var router
  @State private var isShowingAccount = false

  var body: some View {
    @Bindable var router = router
    NavigationStack(path: $router.path) {
      HomeScreen()
        .toolbar {
          ToolbarItem(placement: .topBarTrailing) {
            Button { isShowingAccount = true } label: {
              Label("root.account", systemImage: "person.crop.circle")
            }
          }
        }
        .navigationDestination(for: Route.self) { route in
          switch route {
          case let .channel(slug):
            ChannelScreen(slug: slug)
          }
        }
    }
    .sheet(isPresented: $isShowingAccount) { SignedInScreen() }
  }
}

struct ChannelScreen: View {
  let slug: ChannelSlug

  @Environment(ChannelPlayback.self) private var channelPlayback
  @Environment(LiveStatusChannel.self) private var liveStatus
  @Environment(ChatSession.self) private var chat

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      PlayerSurface()
      ChannelHeader()
      ChatList()
      ChatComposer()
    }
    .navigationTitle(slug.rawValue)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: slug) { await channelPlayback.open(slug) }
    .task(id: slug) { await liveStatus.run(slug) }
    .task(id: slug) { await chat.run(slug) }
  }
}

struct Stores {
  let session: SessionStore
  let launch: LaunchStore
  let home: HomeStore
  let router: Router
  let player: PlayerController
  let channelPlayback: ChannelPlayback
  let liveStatus: LiveStatusChannel
  let chat: ChatSession
}

@MainActor
enum Composition {
  nonisolated static func clientVersion(info: [String: Any]) -> String? {
    info["CFBundleShortVersionString"] as? String
  }

  nonisolated static func chatBaseURL(info: [String: Any]) -> URL? {
    guard let value = info["CHAT_BASE_URL"] as? String, let url = URL(string: value), url.host() != nil else {
      return nil
    }
    return url
  }

  static func stores(info: [String: Any]) -> Stores {
    let configuration: OAuthConfiguration
    do {
      configuration = try OAuthConfiguration(infoDictionary: info)
    } catch {
      fatalError("Info.plist : configuration OAuth invalide (\(error)).")
    }
    guard let version = clientVersion(info: info), let currentVersion = try? AppVersion(version) else {
      fatalError("Info.plist : CFBundleShortVersionString manquant ou mal formé.")
    }
    guard let chatBaseURL = chatBaseURL(info: info) else {
      fatalError("Info.plist : CHAT_BASE_URL manquant ou mal formé.")
    }
    let transport = ClientVersionTransport(wrapping: URLSessionHTTPTransport(), version: version)
    let session = OAuthSession(
      endpoint: TokenEndpoint(configuration: configuration, transport: transport),
      store: KeychainTokenStore(service: Bundle.main.bundleIdentifier ?? "com.muhammedcavus.twitch")
    )
    let now: @Sendable () -> Date = { Date.now }
    let player = PlayerController(player: AVMediaPlayer(), startupRetry: .every(.seconds(2), attempts: 15))
    let channels = ChannelClient(apiBaseURL: configuration.apiBaseURL, transport: transport)
    let channelPlayback = ChannelPlayback(
      channels: channels,
      playback: PlaybackClient(apiBaseURL: configuration.apiBaseURL, transport: transport),
      controller: player
    )
    let sessionStore = Self.sessionStore(configuration: configuration, session: session, transport: transport, now: now)
    return Stores(
      session: sessionStore,
      launch: LaunchStore(
        source: BootstrapClient(apiBaseURL: configuration.apiBaseURL, transport: transport),
        currentVersion: currentVersion
      ),
      home: HomeStore(directory: LiveDirectoryClient(apiBaseURL: configuration.apiBaseURL, transport: transport)),
      router: Router(),
      player: player,
      channelPlayback: channelPlayback,
      liveStatus: LiveStatusChannel(
        channels: channels,
        source: LiveStatusClient(apiBaseURL: configuration.apiBaseURL, transport: URLSessionLineTransport()),
        onEnded: { player.end() },
        onLive: { channelPlayback.channelWentLive() }
      ),
      chat: ChatSession(
        connector: ChatSocketConnector(chatBaseURL: chatBaseURL),
        tokens: session,
        channels: channels,
        moderation: ModerationClient(apiBaseURL: configuration.apiBaseURL, transport: transport, tokens: session, now: now),
        viewer: { await sessionStore.accountID }
      )
    )
  }

  private static func sessionStore(
    configuration: OAuthConfiguration,
    session: OAuthSession,
    transport: ClientVersionTransport,
    now: @escaping @Sendable () -> Date
  ) -> SessionStore {
    SessionStore(
      configuration: configuration,
      session: session,
      accounts: AccountClient(apiBaseURL: configuration.apiBaseURL, transport: transport, tokens: session, now: now),
      authenticator: SystemWebAuthenticator(),
      randomBytes: PKCE.systemRandomBytes,
      now: now
    )
  }
}
