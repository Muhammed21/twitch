import DesignTokens
import SwiftUI

public enum TextRole: Sendable {
  case hero
  case actionLabel
  case dialogTitle
  case dialogMessage
  case display
  case body

  public var font: Font {
    switch self {
    case .hero: .heroText
    case .actionLabel: .actionLabel
    case .dialogTitle: .dialogTitle
    case .dialogMessage: .dialogMessage
    case .display: .displayText
    case .body: .bodyText
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
