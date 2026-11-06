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
        headerActions
        BrowseTabs(selection: $section, items: [
          BrowseTabItem(tab: .about, title: String(localized: ProfileText.title(of: .about)), accessibilityIdentifier: "profile.about"),
        ])
        .padding(.top, LayoutRole.profileTabTop.points)
        about
        myChannel
          .padding(.top, LayoutRole.menuCardGap.points)
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

  private var myChannel: some View {
    MenuCard {
      Button {
        if case let .ready(owned) = store.phase { actions.onOpenChannel(owned.slug) }
      } label: {
        MenuRow(systemImage: "person.crop.square", label: ProfileText.myChannel, showsChevron: true)
      }
      .disabled(!store.isReady)
      .accessibilityIdentifier("profile.myChannel")
    }
  }

  private var settingsAction: ProfileHeaderAction {
    ProfileHeaderAction(label: String(localized: ProfileText.settings)) { isShowingSettings = true }
  }
}

public struct ProfileActions {
  let onOpenChannel: (ChannelSlug) -> Void
  let onAccountSaved: (Account) -> Void
  let onStreamManager: () -> Void
  let onAnalytics: () -> Void
  let onTryAdFree: (() -> Void)?

  public init(
    onOpenChannel: @escaping (ChannelSlug) -> Void,
    onAccountSaved: @escaping (Account) -> Void,
    onStreamManager: @escaping () -> Void,
    onAnalytics: @escaping () -> Void,
    onTryAdFree: (() -> Void)? = nil
  ) {
    self.onOpenChannel = onOpenChannel
    self.onAccountSaved = onAccountSaved
    self.onStreamManager = onStreamManager
    self.onAnalytics = onAnalytics
    self.onTryAdFree = onTryAdFree
  }
}

struct MenuCard<Content: View>: View {
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(spacing: 0, content: content)
      .background(ColorRole.surface.color, in: RoundedRectangle(cornerRadius: LayoutRole.menuCardRadius.points))
  }
}

struct MenuRow: View {
  let systemImage: String
  let label: LocalizedStringResource
  let showsChevron: Bool

  var body: some View {
    HStack(spacing: LayoutRole.menuLabelGap.points) {
      Image(systemName: systemImage)
        .frame(width: LayoutRole.menuIconWidth.points)
      Text(label)
      Spacer(minLength: 0)
      if showsChevron {
        Image(systemName: "chevron.right")
      }
    }
    .font(TextRole.display.font)
    .foregroundStyle(ColorRole.textPrimary.color)
    .padding(.horizontal, LayoutRole.menuRowPadding.points)
    .frame(minHeight: LayoutRole.menuRowHeight.points)
    .contentShape(Rectangle())
  }
}

public extension MyChannelStore {
  func pictures(of account: Account) -> ProfilePictures {
    ProfilePictures(avatar: account.avatarURL, banner: bannerURL)
  }
}

extension MyChannelStore {
  var isReady: Bool {
    guard case .ready = phase else { return false }
    return true
  }
}
