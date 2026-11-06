import SwiftUI

public enum ActivityStyle {
  public static let title = ColorRole.textPrimary
  public static let emptyForeground = ColorRole.textSecondary
  public static let actionBackground = ColorRole.accent
  public static let actionForeground = ColorRole.onAccent
}

public struct ActivityHeader: View {
  private let title: String

  public init(title: String) {
    self.title = title
  }

  public var body: some View {
    Text(verbatim: title)
      .font(TextRole.activityTitle.font)
      .foregroundStyle(ActivityStyle.title.color)
      .accessibilityAddTraits(.isHeader)
      .frame(maxWidth: .infinity)
      .frame(height: LayoutRole.activityHeaderHeight.points)
  }
}

public struct ActivityEmptyAction {
  public let label: String
  public let isEnabled: Bool
  public let accessibilityIdentifier: String
  public let action: () -> Void

  public init(label: String, isEnabled: Bool, accessibilityIdentifier: String, action: @escaping () -> Void = {}) {
    self.label = label
    self.isEnabled = isEnabled
    self.accessibilityIdentifier = accessibilityIdentifier
    self.action = action
  }
}

public enum ActivityEmptyIllustration: Sendable {
  case notifications
  case whispers

  var illustration: Illustration {
    switch self {
    case .notifications: .glasses
    case .whispers: .character
    }
  }

  var gap: LayoutRole {
    switch self {
    case .notifications: .activityNotificationsIllustrationGap
    case .whispers: .activityWhispersIllustrationGap
    }
  }
}

public struct ActivityEmptyState: View {
  private let title: String
  private let message: String
  private let illustration: ActivityEmptyIllustration
  private let action: ActivityEmptyAction?

  public init(title: String, message: String, illustration: ActivityEmptyIllustration, action: ActivityEmptyAction? = nil) {
    self.title = title
    self.message = message
    self.illustration = illustration
    self.action = action
  }

  public var body: some View {
    VStack(spacing: illustration.gap.points) {
      IllustrationImage(illustration.illustration)
      VStack(spacing: LayoutRole.activityEmptyGap.points) {
        Text(verbatim: title)
          .font(TextRole.activityEmptyTitle.font)
        Text(verbatim: message)
          .font(TextRole.activityEmptyMessage.font)
        if let action {
          ActivityEmptyButton(action: action)
        }
      }
    }
    .foregroundStyle(ActivityStyle.emptyForeground.color)
    .multilineTextAlignment(.center)
    .padding(.horizontal, LayoutRole.activityEmptyInset.points)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

private struct ActivityEmptyButton: View {
  let action: ActivityEmptyAction

  var body: some View {
    Button(action: action.action) {
      Text(verbatim: action.label)
        .font(TextRole.activityEmptyAction.font)
        .foregroundStyle(ActivityStyle.actionForeground.color)
        .padding(.horizontal, LayoutRole.activityActionPadding.points)
        .frame(height: LayoutRole.activityActionHeight.points)
        .background(ActivityStyle.actionBackground.color, in: Capsule())
    }
    .buttonStyle(.plain)
    .disabled(!action.isEnabled)
    .accessibilityIdentifier(action.accessibilityIdentifier)
  }
}
