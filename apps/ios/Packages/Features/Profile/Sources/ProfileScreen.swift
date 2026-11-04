import DesignSystem
import Domain
import SwiftUI

public struct ProfileScreen<Settings: View>: View {
  @Environment(MyChannelStore.self) private var store

  private let accountName: String?
  private let onOpenChannel: (ChannelSlug) -> Void
  private let settings: () -> Settings

  public init(
    accountName: String?,
    onOpenChannel: @escaping (ChannelSlug) -> Void,
    @ViewBuilder settings: @escaping () -> Settings
  ) {
    self.accountName = accountName
    self.onOpenChannel = onOpenChannel
    self.settings = settings
  }

  public var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: LayoutRole.menuCardGap.points) {
        if let accountName {
          Text(accountName)
            .font(TextRole.title.font)
            .foregroundStyle(ColorRole.textPrimary.color)
        }
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
