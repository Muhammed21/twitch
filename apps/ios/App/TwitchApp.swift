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
import Profile
import Purchases
import SwiftUI
import UIKit
import UniformTypeIdentifiers

@main
struct TwitchApp: App {
  @State private var stores = Composition.stores(info: Bundle.main.infoDictionary ?? [:])

  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(stores.session)
        .environment(stores.launch)
        .environment(stores.home)
        .environment(stores.browse)
        .environment(stores.categoryLives)
        .environment(stores.categoryHeaders)
        .environment(stores.router)
        .environment(stores.player)
        .environment(stores.channelPlayback)
        .environment(stores.liveStatus)
        .environment(stores.presence)
        .environment(stores.chat)
        .environment(stores.myChannel)
        .environment(stores.categorySearch)
        .environment(stores.profileEdit)
        .environment(stores.profileImages)
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
  @Environment(MyChannelStore.self) private var myChannel
  @State private var isSplashVisible = true

  var body: some View {
    screen
      .signInFailureAlert(session)
      .logOutFailureAlert(session)
      .onOpenURL { router.open($0) }
      .onChange(of: session.phase) { old, new in
        if RootScreen.resetsNavigation(from: old, to: new) {
          router.reset()
          myChannel.reset()
        }
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
  @Environment(SessionStore.self) private var session

  static let leadingTabs = [
    TabBarItem(
      tab: AppTab.home,
      title: HomeTab.title,
      glyph: .mask(outline: .homeOutline, filled: .homeFilled),
      accessibilityIdentifier: "root.home"
    ),
    TabBarItem(
      tab: AppTab.browse,
      title: BrowseText.tabTitle,
      glyph: .mask(outline: .browseOutline, filled: .browseFilled),
      accessibilityIdentifier: "root.browse"
    ),
  ]

  static let trailingTabs = [
    TabBarItem(
      tab: AppTab.profile,
      title: ProfileText.tabTitle,
      glyph: .avatar,
      accessibilityIdentifier: "root.account"
    ),
  ]

  var body: some View {
    @Bindable var router = router
    TabView(selection: $router.selectedTab) {
      NavigationStack(path: $router.path) {
        HomeScreen().withRouteDestinations()
      }
      .toolbar(.hidden, for: .tabBar)
      .tag(AppTab.home)
      NavigationStack(path: $router.browsePath) {
        BrowseScreen().withRouteDestinations()
      }
      .toolbar(.hidden, for: .tabBar)
      .tag(AppTab.browse)
      NavigationStack(path: $router.profilePath) {
        ProfileScreen(account: account) { slug in
          router.push(.channel(slug))
        } onAccountSaved: { saved in
          session.accountSaved(saved)
        } settings: {
          SignedInScreen()
        }
        .withRouteDestinations()
      }
      .toolbar(.hidden, for: .tabBar)
      .tag(AppTab.profile)
    }
    .fullScreenCover(isPresented: $router.isShowingStreamManager) {
      NavigationStack {
        StreamManagerScreen { router.isShowingStreamManager = false }
      }
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      if router.isTabBarVisible {
        TabBar(
          selection: $router.selectedTab,
          leading: Self.leadingTabs,
          create: TabBarCreate(
            label: ProfileText.streamManagerTitle,
            accessibilityIdentifier: "root.create"
          ) { router.create() },
          trailing: Self.trailingTabs
        )
      }
    }
  }

  private var account: Account? {
    guard case let .signedIn(account) = session.phase else { return nil }
    return account
  }
}

private extension View {
  func withRouteDestinations() -> some View {
    navigationDestination(for: Route.self) { route in
      switch route {
      case let .channel(slug):
        ChannelScreen(slug: slug)
      case let .category(heading):
        CategoryLivesScreen(heading: heading)
      }
    }
  }
}

struct ChannelScreen: View {
  let slug: ChannelSlug

  @Environment(ChannelPlayback.self) private var channelPlayback
  @Environment(LiveStatusChannel.self) private var liveStatus
  @Environment(ChannelPresence.self) private var presence
  @Environment(ChatSession.self) private var chat
  @Environment(\.scenePhase) private var scenePhase

  private var watching: ChannelPresence.Watching {
    ChannelPresence.Watching(slug: slug, status: liveStatus.status, scenePhase: scenePhase)
  }

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
    .task(id: watching) { await presence.run(watching) }
  }
}

struct Stores {
  let session: SessionStore
  let launch: LaunchStore
  let home: HomeStore
  let browse: BrowseStore
  let categoryLives: CategoryLivesCatalog
  let categoryHeaders: CategoryHeaderCatalog
  let router: Router
  let player: PlayerController
  let channelPlayback: ChannelPlayback
  let liveStatus: LiveStatusChannel
  let presence: ChannelPresence
  let chat: ChatSession
  let myChannel: MyChannelStore
  let categorySearch: CategorySearch
  let profileEdit: ProfileEditStore
  let profileImages: ProfileImageStore
  let purchases: StorePurchases
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
    let configuration = oauthConfiguration(info: info)
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
      launch: LaunchStore(source: BootstrapClient(apiBaseURL: configuration.apiBaseURL, transport: transport), currentVersion: currentVersion),
      home: HomeStore(directory: LiveDirectoryClient(apiBaseURL: configuration.apiBaseURL, transport: transport)),
      browse: BrowseStore(directory: CategoryDirectoryClient(apiBaseURL: configuration.apiBaseURL, transport: transport)),
      categoryLives: CategoryLivesCatalog(source: CategoryLivesClient(apiBaseURL: configuration.apiBaseURL, transport: transport)),
      categoryHeaders: Self.categoryHeaders(apiBaseURL: configuration.apiBaseURL, transport: transport, tokens: session, now: now),
      router: Router(),
      player: player,
      channelPlayback: channelPlayback,
      liveStatus: Self.liveStatus(apiBaseURL: configuration.apiBaseURL, channels: channels, player: player, playback: channelPlayback),
      presence: Self.presence(configuration: configuration, channels: channels, session: session, transport: transport, now: now),
      chat: ChatSession(
        connector: ChatSocketConnector(chatBaseURL: chatBaseURL),
        tokens: session,
        channels: channels,
        moderation: ModerationClient(apiBaseURL: configuration.apiBaseURL, transport: transport, tokens: session, now: now),
        viewer: { sessionStore.accountID }
      ),
      myChannel: Self.myChannel(apiBaseURL: configuration.apiBaseURL, transport: transport, tokens: session, channels: channels),
      categorySearch: CategorySearch(catalog: CategoryCatalogClient(apiBaseURL: configuration.apiBaseURL, transport: transport)),
      profileEdit: Self.profileEdit(apiBaseURL: configuration.apiBaseURL, transport: transport, tokens: session, now: now),
      profileImages: Self.profileImages(apiBaseURL: configuration.apiBaseURL, transport: transport, tokens: session, now: now),
      purchases: StorePurchases.live(info: info)
    )
  }

  private static func oauthConfiguration(info: [String: Any]) -> OAuthConfiguration {
    do {
      return try OAuthConfiguration(infoDictionary: info)
    } catch {
      fatalError("Info.plist : configuration OAuth invalide (\(error)).")
    }
  }

  private static func liveStatus(
    apiBaseURL: URL,
    channels: ChannelClient,
    player: PlayerController,
    playback: ChannelPlayback
  ) -> LiveStatusChannel {
    LiveStatusChannel(
      channels: channels,
      source: LiveStatusClient(apiBaseURL: apiBaseURL, transport: URLSessionLineTransport()),
      onEnded: { player.end() },
      onLive: { playback.channelWentLive() }
    )
  }

  private static func presence(
    configuration: OAuthConfiguration,
    channels: ChannelClient,
    session: OAuthSession,
    transport: ClientVersionTransport,
    now: @escaping @Sendable () -> Date
  ) -> ChannelPresence {
    ChannelPresence(
      channels: channels,
      reporter: PresenceClient(apiBaseURL: configuration.apiBaseURL, transport: transport, tokens: session, now: now)
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
