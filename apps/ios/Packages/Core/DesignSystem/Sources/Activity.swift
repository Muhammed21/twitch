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

public struct ActivityEmptyState: View {
  private let title: String
  private let message: String
  private let action: ActivityEmptyAction?

  public init(title: String, message: String, action: ActivityEmptyAction? = nil) {
    self.title = title
    self.message = message
    self.action = action
  }

  public var body: some View {
    VStack(spacing: LayoutRole.activityEmptyGap.points) {
      Text(verbatim: title)
        .font(TextRole.activityEmptyTitle.font)
      Text(verbatim: message)
        .font(TextRole.activityEmptyMessage.font)
      if let action {
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
    .foregroundStyle(ActivityStyle.emptyForeground.color)
    .multilineTextAlignment(.center)
    .padding(.horizontal, LayoutRole.activityEmptyInset.points)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}
