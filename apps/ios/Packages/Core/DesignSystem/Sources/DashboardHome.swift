import SwiftUI

public extension DashboardStyle {
  static let cardBackground = ColorRole.surfaceTertiary
  static let statValue = ColorRole.textPrimary
  static let statLabel = ColorRole.textSecondary
  static let previewBackground = ColorRole.mediaBackground
  static let previewLabel = ColorRole.onMedia
  static let previewAspectRatio: CGFloat = 16.0 / 9.0
  static let primaryButton = ColorRole.accent
  static let onPrimaryButton = ColorRole.onAccent
  static let secondaryButton = ColorRole.surfaceRaised
  static let onSecondaryButton = ColorRole.textPrimary
  static let hint = ColorRole.textPrimary
  static let activityEmpty = ColorRole.textSecondary
  static let link = ColorRole.link
}

public struct DashboardStatItem: Identifiable, Sendable {
  public let id: String
  public let value: String
  public let label: String

  public init(id: String, value: String, label: String) {
    self.id = id
    self.value = value
    self.label = label
  }
}

public struct DashboardStatsCard: View {
  private let items: [DashboardStatItem]

  public init(items: [DashboardStatItem]) {
    self.items = items
  }

  public var body: some View {
    HStack(spacing: 0) {
      ForEach(items) { item in
        VStack(spacing: LayoutRole.dashboardStatGap.points) {
          Text(verbatim: item.value)
            .font(TextRole.dashboardStatValue.font)
            .foregroundStyle(DashboardStyle.statValue.color)
          Text(verbatim: item.label)
            .font(TextRole.dashboardStatLabel.font)
            .foregroundStyle(DashboardStyle.statLabel.color)
            .lineLimit(1)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
      }
    }
    .padding(.horizontal, LayoutRole.dashboardStatsInset.points)
    .frame(height: LayoutRole.dashboardStatsHeight.points)
    .dashboardCard()
  }
}

public struct DashboardStreamCard: View {
  private let offlineLabel: String
  private let primaryLabel: String
  private let secondaryLabel: String
  private let onPrimary: () -> Void
  private let onSecondary: () -> Void

  public init(
    offlineLabel: String,
    primaryLabel: String,
    secondaryLabel: String,
    onPrimary: @escaping () -> Void,
    onSecondary: @escaping () -> Void
  ) {
    self.offlineLabel = offlineLabel
    self.primaryLabel = primaryLabel
    self.secondaryLabel = secondaryLabel
    self.onPrimary = onPrimary
    self.onSecondary = onSecondary
  }

  public var body: some View {
    VStack(spacing: LayoutRole.dashboardStreamGap.points) {
      preview
      DashboardCapsuleButton(
        label: primaryLabel,
        background: DashboardStyle.primaryButton,
        foreground: DashboardStyle.onPrimaryButton,
        action: onPrimary
      )
      .accessibilityIdentifier("dashboard.streamManager")
      DashboardCapsuleButton(
        label: secondaryLabel,
        background: DashboardStyle.secondaryButton,
        foreground: DashboardStyle.onSecondaryButton,
        action: onSecondary
      )
      .accessibilityIdentifier("dashboard.editStreamInfo")
    }
    .padding(LayoutRole.dashboardStreamPadding.points)
    .dashboardCard()
  }

  private var preview: some View {
    DashboardStyle.previewBackground.color
      .aspectRatio(DashboardStyle.previewAspectRatio, contentMode: .fit)
      .overlay(alignment: .topLeading) {
        Text(verbatim: offlineLabel)
          .font(TextRole.dashboardPreviewLabel.font)
          .foregroundStyle(DashboardStyle.previewLabel.color)
          .padding(.leading, LayoutRole.dashboardPreviewLabelLeading.points)
          .padding(.top, LayoutRole.dashboardPreviewLabelTop.points)
      }
      .clipShape(RoundedRectangle(cornerRadius: LayoutRole.dashboardPreviewRadius.points))
  }
}

public struct DashboardHint: View {
  private let text: String

  public init(text: String) {
    self.text = text
  }

  public var body: some View {
    Text(verbatim: text)
      .font(TextRole.dashboardHint.font)
      .foregroundStyle(DashboardStyle.hint.color)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, LayoutRole.dashboardHintInset.points)
      .padding(.top, LayoutRole.dashboardHintTop.points)
  }
}

public struct DashboardActivityCard: View {
  private let message: String
  private let linkLabel: String

  public init(message: String, linkLabel: String) {
    self.message = message
    self.linkLabel = linkLabel
  }

  public var body: some View {
    VStack(spacing: LayoutRole.dashboardCardGap.points) {
      Text(verbatim: message)
        .font(TextRole.dashboardActivityEmpty.font)
        .foregroundStyle(DashboardStyle.activityEmpty.color)
        .frame(maxWidth: .infinity)
        .frame(height: LayoutRole.dashboardActivityHeight.points)
        .dashboardCard()
      Text(verbatim: linkLabel)
        .font(TextRole.dashboardLink.font)
        .foregroundStyle(DashboardStyle.link.color)
    }
  }
}

private struct DashboardCapsuleButton: View {
  let label: String
  let background: ColorRole
  let foreground: ColorRole
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(verbatim: label)
        .font(TextRole.dashboardStreamButton.font)
        .foregroundStyle(foreground.color)
        .lineLimit(1)
        .frame(maxWidth: .infinity)
        .frame(height: LayoutRole.dashboardStreamButtonHeight.points)
        .background(background.color, in: Capsule())
        .contentShape(Capsule())
    }
    .buttonStyle(.plain)
  }
}

private extension View {
  func dashboardCard() -> some View {
    background(
      DashboardStyle.cardBackground.color,
      in: RoundedRectangle(cornerRadius: LayoutRole.dashboardCardRadius.points)
    )
  }
}
