import Auth
import Dashboard
import DesignSystem
import Domain
import Navigation
import Profile
import SwiftUI

struct SignedInModes: View {
  @Environment(CreatorMode.self) private var creatorMode
  @Environment(Router.self) private var router

  var body: some View {
    @Bindable var router = router
    Group {
      switch creatorMode.mode {
      case .viewer: SignedInRoot()
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
  @State private var channelPath: [Route] = []
  @State private var isEditingStreamInfo = false

  var body: some View {
    @Bindable var creatorMode = creatorMode
    TabView(selection: $creatorMode.dashboardTab) {
      DashboardHomeScreen {
        Task { await creatorMode.switchMode() }
      } onStreamManager: {
        router.create()
      } onEditStreamInfo: {
        Task {
          await myChannel.loadIfNeeded()
          isEditingStreamInfo = true
        }
      }
      .toolbar(.hidden, for: .tabBar)
      .tag(DashboardTab.home)
      .sheet(isPresented: $isEditingStreamInfo) {
        EditStreamInfoSheet(initialTitle: myChannel.title, initialCategory: myChannel.category)
      }
      DashboardContentScreen()
        .toolbar(.hidden, for: .tabBar)
        .tag(DashboardTab.content)
      DashboardStatsScreen()
        .toolbar(.hidden, for: .tabBar)
        .tag(DashboardTab.stats)
      NavigationStack(path: $channelPath) {
        ProfileScreen(account: account) { slug in
          channelPath.append(.channel(slug))
        } onAccountSaved: { saved in
          session.accountSaved(saved)
        } settings: {
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

  private var account: Account? {
    guard case let .signedIn(account) = session.phase else { return nil }
    return account
  }
}
