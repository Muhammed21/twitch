import DesignTokens
import SwiftUI

public enum TextRole: Sendable {
  case hero
  case actionLabel
  case dialogTitle
  case dialogMessage
  case display
  case body
  case chatMessage
  case chatAuthor
  case title
  case tabLabel
  case widgetTitle

  public var font: Font {
    switch self {
    case .hero: .heroText
    case .actionLabel: .actionLabel
    case .dialogTitle: .dialogTitle
    case .dialogMessage: .dialogMessage
    case .display: .displayText
    case .body: .bodyText
    case .chatMessage: .supportingText
    case .chatAuthor: .actionLabel
    case .title: .titleText
    case .tabLabel: .tabLabel
    case .widgetTitle: .actionLabel
    }
  }
}

public enum LayoutRole: Sendable {
  case heroInset
  case heroRowGap
  case sloganGap
  case sloganBottom
  case actionInset
  case actionGap
  case actionHeight
  case actionRadius
  case screenInset
  case dialogWidth
  case dialogPadding
  case dialogTitleGap
  case dialogActionsTop
  case dialogActionGap
  case dialogRadius
  case chatInset
  case chatRowGap
  case composerHeight
  case composerPadding
  case composerRadius
  case menuRowHeight
  case menuRowPadding
  case menuIconWidth
  case menuLabelGap
  case menuCardGap
  case menuCardRadius
  case tabBarHeight
  case tabBarTopInset
  case tabLabelGap
  case tabIconSize
  case tabGlyphSize
  case avatarGlyphInset
  case createButtonWidth
  case createButtonHeight
  case createGlyphSize
  case avatarRingWidth
  case avatarRingGap
  case widgetInset
  case widgetGap
  case widgetHeaderHeight
  case widgetHeaderPadding
  case widgetRadius
  case dockButtonSize
  case dockGap
  case dockRingWidth
  case dockRingGap

  public var points: CGFloat {
    switch self {
    case .heroInset: Spacing.x40
    case .heroRowGap: Spacing.x4
    case .sloganGap: Spacing.x12
    case .sloganBottom: Spacing.x12
    case .actionInset: Spacing.x20
    case .actionGap: Spacing.x16
    case .actionHeight: Spacing.x44
    case .actionRadius: Radius.lg
    case .screenInset: Spacing.x16
    case .dialogWidth: Spacing.x300
    case .dialogPadding: Spacing.x16
    case .dialogTitleGap: Spacing.x15
    case .dialogActionsTop: Spacing.x16
    case .dialogActionGap: Spacing.x8
    case .dialogRadius: Radius.xxl
    case .chatInset: Spacing.x8
    case .chatRowGap: Spacing.x20
    case .composerHeight: Spacing.x40
    case .composerPadding: Spacing.x12
    case .composerRadius: Radius.lg
    case .menuRowHeight: Spacing.x56
    case .menuRowPadding: Spacing.x16
    case .menuIconWidth: Spacing.x20
    case .menuLabelGap: Spacing.x20
    case .menuCardGap: Spacing.x16
    case .menuCardRadius: Radius.xxl
    case .tabBarHeight: Spacing.x49
    case .tabBarTopInset: Spacing.x8
    case .tabLabelGap: Spacing.x2
    case .tabIconSize: Spacing.x24
    case .tabGlyphSize: Spacing.x20
    case .avatarGlyphInset: Spacing.x5
    case .createButtonWidth: Spacing.x72
    case .createButtonHeight: Spacing.x40
    case .createGlyphSize: Spacing.x14
    case .avatarRingWidth: Spacing.x2
    case .avatarRingGap: Spacing.x1
    case .widgetInset: Spacing.x14
    case .widgetGap: Spacing.x8
    case .widgetHeaderHeight: Spacing.x40
    case .widgetHeaderPadding: Spacing.x8
    case .widgetRadius: Radius.md
    case .dockButtonSize: Spacing.x44
    case .dockGap: Spacing.x16
    case .dockRingWidth: Spacing.x2
    case .dockRingGap: Spacing.x3
    }
  }
}

public enum ActionButtonKind: Sendable {
  case primary
  case primaryOnAccent
  case secondaryOnAccent
  case secondary
  case destructive
  case cancel

  public var background: ColorRole {
    switch self {
    case .primary: .accent
    case .primaryOnAccent: .onAccent
    case .secondaryOnAccent: .accentSubtle
    case .secondary: .surfaceSecondary
    case .destructive: .danger
    case .cancel: .surfaceTertiary
    }
  }

  public var foreground: ColorRole {
    switch self {
    case .primaryOnAccent: .onAccentStrong
    case .primary, .secondaryOnAccent: .onAccent
    case .secondary, .cancel: .textPrimary
    case .destructive: .onDanger
    }
  }
}

public struct ActionButtonStyle: ButtonStyle {
  private let kind: ActionButtonKind

  public init(_ kind: ActionButtonKind) {
    self.kind = kind
  }

  public func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(TextRole.actionLabel.font)
      .foregroundStyle(kind.foreground.color)
      .frame(maxWidth: .infinity, minHeight: LayoutRole.actionHeight.points)
      .background(
        kind.background.color.opacity(configuration.isPressed ? 0.8 : 1),
        in: RoundedRectangle(cornerRadius: LayoutRole.actionRadius.points)
      )
  }
}
