import SwiftUI

public enum TabBarGlyph: Equatable, Sendable {
  case symbol(outline: String, filled: String)
  case avatar

  public func systemName(isSelected: Bool) -> String? {
    switch self {
    case let .symbol(outline, filled): isSelected ? filled : outline
    case .avatar: nil
    }
  }

  public static func foreground(isSelected: Bool) -> ColorRole {
    isSelected ? .navigationActive : .textPrimary
  }
}

public struct TabBarItem<Tab: Hashable>: Identifiable {
  public let tab: Tab
  public let title: String
  public let glyph: TabBarGlyph
  public let accessibilityIdentifier: String

  public var id: Tab { tab }

  public init(tab: Tab, title: String, glyph: TabBarGlyph, accessibilityIdentifier: String) {
    self.tab = tab
    self.title = title
    self.glyph = glyph
    self.accessibilityIdentifier = accessibilityIdentifier
  }
}

public struct TabBar<Tab: Hashable>: View {
  @Binding private var selection: Tab
  @Environment(\.displayScale) private var displayScale
  private let items: [TabBarItem<Tab>]

  public init(selection: Binding<Tab>, items: [TabBarItem<Tab>]) {
    _selection = selection
    self.items = items
  }

  public var body: some View {
    VStack(spacing: 0) {
      Rectangle()
        .fill(ColorRole.border.color)
        .frame(height: 1 / displayScale)
      HStack(spacing: 0) {
        ForEach(items) { item in
          Button { selection = item.tab } label: {
            TabBarCell(item: item, isSelected: item.tab == selection)
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(item.tab == selection ? .isSelected : [])
          .accessibilityIdentifier(item.accessibilityIdentifier)
        }
      }
      .frame(height: LayoutRole.tabBarHeight.points, alignment: .top)
      .accessibilityElement(children: .contain)
      .accessibilityAddTraits(.isTabBar)
    }
    .background(ColorRole.background.color.ignoresSafeArea(edges: .bottom))
  }
}

private struct TabBarCell<Tab: Hashable>: View {
  let item: TabBarItem<Tab>
  let isSelected: Bool

  var body: some View {
    VStack(spacing: LayoutRole.tabLabelGap.points) {
      glyph
        .frame(width: LayoutRole.tabIconSize.points, height: LayoutRole.tabIconSize.points)
      Text(verbatim: item.title)
        .font(TextRole.tabLabel.font)
    }
    .foregroundStyle(TabBarGlyph.foreground(isSelected: isSelected).color)
    .padding(.top, LayoutRole.tabBarTopInset.points)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .contentShape(Rectangle())
  }

  @ViewBuilder private var glyph: some View {
    if let systemName = item.glyph.systemName(isSelected: isSelected) {
      Image(systemName: systemName)
        .resizable()
        .scaledToFit()
        .frame(width: LayoutRole.tabGlyphSize.points, height: LayoutRole.tabGlyphSize.points)
        .accessibilityHidden(true)
    } else {
      DefaultAvatar(isRinged: isSelected)
    }
  }
}

private struct DefaultAvatar: View {
  let isRinged: Bool

  private var diameter: CGFloat { LayoutRole.tabIconSize.points }
  private var ringInset: CGFloat { LayoutRole.avatarRingWidth.points + LayoutRole.avatarRingGap.points }

  var body: some View {
    Circle()
      .fill(ColorRole.avatarDefault.color)
      .overlay {
        Image(systemName: "person")
          .resizable()
          .scaledToFit()
          .foregroundStyle(ColorRole.onAvatarDefault.color)
          .padding(LayoutRole.avatarGlyphInset.points)
      }
      .scaleEffect(isRinged ? (diameter - 2 * ringInset) / diameter : 1)
      .overlay {
        if isRinged {
          Circle().strokeBorder(ColorRole.navigationActive.color, lineWidth: LayoutRole.avatarRingWidth.points)
        }
      }
      .accessibilityHidden(true)
  }
}
