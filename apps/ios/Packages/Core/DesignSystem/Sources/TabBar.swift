import SwiftUI

public enum TabBarGlyph: Equatable, Sendable {
  case mask(outline: Glyph, filled: Glyph)
  case avatar

  public func mask(isSelected: Bool) -> Glyph? {
    switch self {
    case let .mask(outline, filled): isSelected ? filled : outline
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

public struct TabBarCreate {
  public let label: String
  public let accessibilityIdentifier: String
  public let action: () -> Void

  public init(label: String, accessibilityIdentifier: String, action: @escaping () -> Void) {
    self.label = label
    self.accessibilityIdentifier = accessibilityIdentifier
    self.action = action
  }
}

public enum TabBarCreateStyle {
  public static let background = ColorRole.surfaceSecondary
  public static let foreground = ColorRole.textPrimary
}

public struct TabBar<Tab: Hashable>: View {
  @Binding private var selection: Tab
  @Environment(\.displayScale) private var displayScale
  private let leading: [TabBarItem<Tab>]
  private let create: TabBarCreate?
  private let trailing: [TabBarItem<Tab>]

  public init(
    selection: Binding<Tab>,
    leading: [TabBarItem<Tab>],
    create: TabBarCreate? = nil,
    trailing: [TabBarItem<Tab>] = []
  ) {
    _selection = selection
    self.leading = leading
    self.create = create
    self.trailing = trailing
  }

  public var body: some View {
    VStack(spacing: 0) {
      Rectangle()
        .fill(ColorRole.border.color)
        .frame(height: 1 / displayScale)
      HStack(spacing: 0) {
        ForEach(leading) { tabButton($0) }
        if let create {
          CreateButton(create: create)
        }
        ForEach(trailing) { tabButton($0) }
      }
      .frame(height: LayoutRole.tabBarHeight.points, alignment: .top)
      .accessibilityElement(children: .contain)
      .accessibilityAddTraits(.isTabBar)
    }
    .background(ColorRole.background.color.ignoresSafeArea(edges: .bottom))
  }

  private func tabButton(_ item: TabBarItem<Tab>) -> some View {
    Button { selection = item.tab } label: {
      TabBarCell(item: item, isSelected: item.tab == selection)
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(item.tab == selection ? .isSelected : [])
    .accessibilityIdentifier(item.accessibilityIdentifier)
  }
}

private struct CreateButton: View {
  let create: TabBarCreate

  var body: some View {
    Button(action: create.action) {
      Glyph.plus.image
        .frame(width: LayoutRole.createGlyphSize.points, height: LayoutRole.createGlyphSize.points)
        .foregroundStyle(TabBarCreateStyle.foreground.color)
        .frame(width: LayoutRole.createButtonWidth.points, height: LayoutRole.createButtonHeight.points)
        .background(TabBarCreateStyle.background.color, in: Capsule())
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(create.label)
    .accessibilityIdentifier(create.accessibilityIdentifier)
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
    if let mask = item.glyph.mask(isSelected: isSelected) {
      mask.image
        .accessibilityHidden(true)
    } else {
      DefaultAvatar(
        diameter: LayoutRole.tabIconSize.points,
        glyphInset: LayoutRole.avatarGlyphInset.points,
        isRinged: isSelected
      )
    }
  }
}

struct DefaultAvatar: View {
  let diameter: CGFloat
  let glyphInset: CGFloat
  var isRinged = false

  private var ringInset: CGFloat { LayoutRole.avatarRingWidth.points + LayoutRole.avatarRingGap.points }

  var body: some View {
    Circle()
      .fill(ColorRole.avatarDefault.color)
      .overlay {
        Glyph.avatarPerson.image
          .resizable()
          .scaledToFit()
          .foregroundStyle(ColorRole.onAvatarDefault.color)
          .padding(glyphInset)
      }
      .scaleEffect(isRinged ? (diameter - 2 * ringInset) / diameter : 1)
      .overlay {
        if isRinged {
          Circle().strokeBorder(ColorRole.navigationActive.color, lineWidth: LayoutRole.avatarRingWidth.points)
        }
      }
      .frame(width: diameter, height: diameter)
      .accessibilityHidden(true)
  }
}
