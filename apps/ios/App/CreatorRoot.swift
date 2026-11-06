import Auth
import Dashboard
import DesignSystem
import Domain
import Navigation
import Profile
import SwiftUI

struct SignedInModes: View {
  let paywall: PersonalizationPaywall
  @Environment(CreatorMode.self) private var creatorMode
  @Environment(Router.self) private var router

  var body: some View {
    @Bindable var router = router
    Group {
      switch creatorMode.mode {
      case .viewer: SignedInRoot(paywall: paywall)
      case .creator: CreatorRoot()
      }
    }
    .fullScreenCover(isPresented: $router.isShowingStreamManager) {
      NavigationStack {
        StreamManagerScreen { router.isShowingStreamManager = false }
      }
    }
    .creatorModePresentation { router.create() }
  }
}

struct CreatorRoot: View {
  @Environment(CreatorMode.self) private var creatorMode
  @Environment(SessionStore.self) private var session
  @Environment(Router.self) private var router
  @Environment(MyChannelStore.self) private var myChannel
  @Environment(DashboardLiveFigures.self) private var liveFigures
  @State private var channelPath: [Route] = []
  @State private var isEditingStreamInfo = false

  var body: some View {
    @Bindable var creatorMode = creatorMode
    TabView(selection: $creatorMode.dashboardTab) {
      DashboardHomeScreen(status: liveFigures.status) {
        Task { await creatorMode.switchMode() }
      } onStreamManager: {
        router.create()
      } onEditStreamInfo: {
        Task { isEditingStreamInfo = await myChannel.loadForEditing() }
      }
      .toolbar(.hidden, for: .tabBar)
      .tag(DashboardTab.home)
      .task { await myChannel.loadIfNeeded() }
      .task(id: ownedChannel) {
        guard let ownedChannel else { return }
        await liveFigures.follow(ownedChannel)
      }
      .sheet(isPresented: $isEditingStreamInfo) {
        EditStreamInfoSheet(initial: myChannel.proposedInfo)
      }
      DashboardContentScreen()
        .toolbar(.hidden, for: .tabBar)
        .tag(DashboardTab.content)
      DashboardStatsScreen()
        .toolbar(.hidden, for: .tabBar)
        .tag(DashboardTab.stats)
      NavigationStack(path: $channelPath) {
        ProfileScreen(account: account, actions: ProfileActions(
          onOpenChannel: { channelPath.append(.channel($0)) },
          onAccountSaved: { session.accountSaved($0) },
          onStreamManager: { router.create() },
          onAnalytics: { creatorMode.dashboardTab = .stats }
        )) {
          SignedInScreen()
        }
        .withRouteDestinations()
      }
      .toolbar(.hidden, for: .tabBar)
      .tag(DashboardTab.channel)
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      if channelPath.isEmpty {
        TabBar(
          selection: $creatorMode.dashboardTab,
          leading: DashboardTabs.leading,
          create: TabBarCreate(
            label: ProfileText.streamManagerTitle,
            accessibilityIdentifier: "dashboard.create",
            style: DashboardTabs.createStyle
          ) { creatorMode.showActions() },
          trailing: DashboardTabs.trailing
        )
      }
    }
  }

  private var ownedChannel: ChannelID? {
    guard case let .ready(owned) = myChannel.phase else { return nil }
    return owned.id
  }

  private var account: Account? {
    guard case let .signedIn(account) = session.phase else { return nil }
    return account
  }
}
