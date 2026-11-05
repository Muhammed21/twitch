import SwiftUI

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
