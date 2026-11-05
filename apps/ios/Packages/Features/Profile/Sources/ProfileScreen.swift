import DesignSystem
import Domain
import SwiftUI

public struct ProfileScreen<Settings: View>: View {
  @Environment(MyChannelStore.self) private var store

  @Environment(\.locale) private var locale
  @State private var isEditing = false
  private let account: Account?
  private let onOpenChannel: (ChannelSlug) -> Void
  private let onAccountSaved: (Account) -> Void
  private let settings: () -> Settings

  public init(
    account: Account?,
    onOpenChannel: @escaping (ChannelSlug) -> Void,
    onAccountSaved: @escaping (Account) -> Void,
    @ViewBuilder settings: @escaping () -> Settings
  ) {
    self.account = account
    self.onOpenChannel = onOpenChannel
    self.onAccountSaved = onAccountSaved
    self.settings = settings
  }

  public var body: some View {
    ScrollView {
      if let account {
        TimelineView(.everyMinute) { context in
          ProfileHeader(
            name: account.name,
            lastLive: account.lastLiveAt.map { ProfileText.lastLive(at: $0, now: context.date, locale: locale) },
            bio: account.bio,
            edit: ProfileHeaderAction(label: String(localized: EditProfileText.edit)) { isEditing = true }
          )
        }
        .sheet(isPresented: $isEditing) {
          EditProfileSheet(account: account, onSaved: onAccountSaved)
        }
      }
      VStack(alignment: .leading, spacing: LayoutRole.menuCardGap.points) {
        MenuCard {
          Button {
            if case let .ready(owned) = store.phase { onOpenChannel(owned.slug) }
          } label: {
            MenuRow(systemImage: "person.crop.square", label: ProfileText.myChannel, showsChevron: true)
          }
          .disabled(!store.isReady)
          .accessibilityIdentifier("profile.myChannel")
        }
        MenuCard {
          NavigationLink {
            StreamManagerScreen()
          } label: {
            MenuRow(systemImage: "dot.radiowaves.left.and.right", label: ProfileText.streamManager, showsChevron: false)
          }
          .accessibilityIdentifier("profile.streamManager")
        }
        MenuCard {
          NavigationLink(destination: settings) {
            MenuRow(systemImage: "gearshape", label: ProfileText.settings, showsChevron: true)
          }
          .accessibilityIdentifier("profile.settings")
        }
      }
      .padding(LayoutRole.screenInset.points)
    }
    .background(ColorRole.background.color.ignoresSafeArea())
    .toolbar(.hidden, for: .navigationBar)
    .task { await store.load() }
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

extension MyChannelStore {
  var isReady: Bool {
    guard case .ready = phase else { return false }
    return true
  }
}
