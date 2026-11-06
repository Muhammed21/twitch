import DesignSystem
import Domain
import SwiftUI

public struct ProfileScreen<Settings: View>: View {
  @Environment(MyChannelStore.self) private var store

  @Environment(\.locale) private var locale
  @State private var isEditing = false
  @State private var isShowingSettings = false
  @State private var section = ProfileSection.about
  private let account: Account?
  private let actions: ProfileActions
  private let settings: () -> Settings

  public init(account: Account?, actions: ProfileActions, @ViewBuilder settings: @escaping () -> Settings) {
    self.account = account
    self.actions = actions
    self.settings = settings
  }

  public var body: some View {
    ScrollView {
      if let account {
        TimelineView(.everyMinute) { context in
          ProfileHeader(
            name: account.name,
            lastLive: account.lastLiveAt.map { ProfileText.lastLive(at: $0, now: context.date, locale: locale) },
            pictures: store.pictures(of: account),
            settings: settingsAction,
            edit: ProfileHeaderAction(label: String(localized: EditProfileText.edit)) { isEditing = true }
          )
        }
        .sheet(isPresented: $isEditing) {
          EditProfileSheet(account: account, onSaved: actions.onAccountSaved)
        }
      } else {
        ProfileBanner(imageURL: store.bannerURL, settings: settingsAction)
      }
      VStack(alignment: .leading, spacing: 0) {
        accountFailure
        headerActions
        BrowseTabs(selection: $section, items: [
          BrowseTabItem(tab: .about, title: String(localized: ProfileText.title(of: .about)), accessibilityIdentifier: "profile.about"),
        ])
        .padding(.top, LayoutRole.profileTabTop.points)
        about
      }
      .padding(.horizontal, LayoutRole.screenInset.points)
    }
    .background(ColorRole.background.color.ignoresSafeArea())
    .toolbar(.hidden, for: .navigationBar)
    .navigationDestination(isPresented: $isShowingSettings, destination: settings)
    .task { await store.load() }
  }

  private var headerActions: some View {
    VStack(spacing: LayoutRole.profileActionRowGap.points) {
      HStack(spacing: LayoutRole.profileActionGap.points) {
        ProfileActionButton(label: String(localized: ProfileText.streamManager), action: actions.onStreamManager)
          .accessibilityIdentifier("profile.streamManager")
        ProfileActionButton(label: String(localized: ProfileText.analytics), glyph: .statsOutline, action: actions.onAnalytics)
          .accessibilityIdentifier("profile.analytics")
      }
      if let onTryAdFree = actions.onTryAdFree {
        ProfileActionButton(label: String(localized: ProfileText.tryAdFree), glyph: .turboBattery, action: onTryAdFree)
          .accessibilityIdentifier("profile.tryAdFree")
      }
    }
  }

  @ViewBuilder private var about: some View {
    if let bio = account?.bio {
      Text(bio)
        .font(TextRole.profileDetail.font)
        .foregroundStyle(ProfileHeaderStyle.bio.color)
        .padding(.top, LayoutRole.profileBioTop.points)
        .accessibilityIdentifier("profile.bio")
    } else {
      ProfileAboutEmpty(
        title: String(localized: ProfileText.aboutEmptyTitle),
        message: String(localized: ProfileText.aboutEmptyMessage)
      )
    }
  }

  @ViewBuilder private var accountFailure: some View {
    if account == nil, let onRetryAccount = actions.onRetryAccount {
      VStack(alignment: .leading, spacing: LayoutRole.menuCardGap.points) {
        Text(ProfileText.accountFailed)
          .font(TextRole.body.font)
          .foregroundStyle(ColorRole.textSecondary.color)
        Button(ProfileText.retry, action: onRetryAccount)
          .buttonStyle(ActionButtonStyle(.secondary))
          .accessibilityIdentifier("profile.retryAccount")
      }
      .padding(.vertical, LayoutRole.menuCardGap.points)
    }
  }

  private var settingsAction: ProfileHeaderAction {
    ProfileHeaderAction(label: String(localized: ProfileText.settings)) { isShowingSettings = true }
  }
}

public struct ProfileActions {
  let onAccountSaved: (Account) -> Void
  let onStreamManager: () -> Void
  let onAnalytics: () -> Void
  let onTryAdFree: (() -> Void)?
  let onRetryAccount: (() -> Void)?

  public init(
    onAccountSaved: @escaping (Account) -> Void,
    onStreamManager: @escaping () -> Void,
    onAnalytics: @escaping () -> Void,
    onTryAdFree: (() -> Void)? = nil,
    onRetryAccount: (() -> Void)? = nil
  ) {
    self.onAccountSaved = onAccountSaved
    self.onStreamManager = onStreamManager
    self.onAnalytics = onAnalytics
    self.onTryAdFree = onTryAdFree
    self.onRetryAccount = onRetryAccount
  }
}

public extension MyChannelStore {
  func pictures(of account: Account) -> ProfilePictures {
    ProfilePictures(avatar: account.avatarURL, banner: bannerURL)
  }
}
