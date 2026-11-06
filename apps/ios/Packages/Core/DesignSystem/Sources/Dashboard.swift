import SwiftUI

public enum DashboardStyle {
  public static let fieldBackground = ColorRole.surfaceSecondary
  public static let fieldGlyph = ColorRole.textSecondary
  public static let emptyForeground = ColorRole.textPrimary
  public static let pillBackground = ColorRole.surfaceSecondary
  public static let watchGlyph = Glyph.watchEye

  public static func iconForeground(isEnabled: Bool) -> ColorRole {
    isEnabled ? .textPrimary : .iconDisabled
  }
}

public enum DashboardTabGlyphs {
  public static let home = TabBarGlyph.mask(outline: .homeOutline, filled: .homeFilled)
  public static let content = TabBarGlyph.mask(outline: .contentOutline, filled: .contentFilled)
  public static let stats = TabBarGlyph.mask(outline: .statsOutline, filled: .statsFilled)
  public static let channel = TabBarGlyph.mask(outline: .channelOutline, filled: .channelOutline)
}

public struct DashboardHeader<Trailing: View>: View {
  private let title: String
  private let trailing: Trailing

  public init(title: String, @ViewBuilder trailing: () -> Trailing) {
    self.title = title
    self.trailing = trailing()
  }

  public var body: some View {
    ZStack {
      Text(verbatim: title)
        .font(TextRole.dashboardTitle.font)
        .foregroundStyle(ColorRole.textPrimary.color)
        .accessibilityAddTraits(.isHeader)
      HStack(spacing: 0) {
        DefaultAvatar(
          diameter: LayoutRole.dashboardAvatarSize.points,
          glyphInset: LayoutRole.avatarGlyphInset.points
        )
        Spacer(minLength: 0)
        trailing
      }
    }
    .padding(.horizontal, LayoutRole.screenInset.points)
    .frame(height: LayoutRole.dashboardHeaderHeight.points)
  }
}

public struct DashboardIconButton: View {
  private let glyph: Glyph
  private let label: String
  private let isEnabled: Bool
  private let action: () -> Void

  public init(glyph: Glyph, label: String, isEnabled: Bool = true, action: @escaping () -> Void = {}) {
    self.glyph = glyph
    self.label = label
    self.isEnabled = isEnabled
    self.action = action
  }

  public var body: some View {
    Button(action: action) {
      glyph.image
        .foregroundStyle(DashboardStyle.iconForeground(isEnabled: isEnabled).color)
        .frame(width: LayoutRole.dashboardIconTarget.points, height: LayoutRole.dashboardIconTarget.points)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .disabled(!isEnabled)
    .accessibilityLabel(label)
  }
}

public struct DashboardPillButton: View {
  private let glyph: Glyph
  private let label: String
  private let action: () -> Void

  public init(glyph: Glyph, label: String, action: @escaping () -> Void) {
    self.glyph = glyph
    self.label = label
    self.action = action
  }

  public var body: some View {
    Button(action: action) {
      HStack(spacing: LayoutRole.dashboardPillLeading.points) {
        glyph.image
          .accessibilityHidden(true)
        Text(verbatim: label)
          .font(TextRole.dashboardAction.font)
      }
      .foregroundStyle(ColorRole.textPrimary.color)
      .padding(.leading, LayoutRole.dashboardPillLeading.points)
      .padding(.trailing, LayoutRole.dashboardPillTrailing.points)
      .frame(height: LayoutRole.dashboardPillHeight.points)
      .background(DashboardStyle.pillBackground.color, in: Capsule())
      .contentShape(Capsule())
    }
    .buttonStyle(.plain)
  }
}

public struct DashboardSearchField: View {
  @Binding private var text: String
  private let prompt: String

  public init(text: Binding<String>, prompt: String) {
    _text = text
    self.prompt = prompt
  }

  public var body: some View {
    HStack(spacing: LayoutRole.dashboardFieldGlyphGap.points) {
      Glyph.searchField.image
        .foregroundStyle(DashboardStyle.fieldGlyph.color)
        .accessibilityHidden(true)
      TextField(text: $text) { Text(verbatim: prompt) }
        .font(TextRole.fieldText.font)
        .foregroundStyle(ColorRole.textPrimary.color)
    }
    .padding(.horizontal, LayoutRole.composerPadding.points)
    .frame(height: LayoutRole.dashboardFieldHeight.points)
    .background(
      DashboardStyle.fieldBackground.color,
      in: RoundedRectangle(cornerRadius: LayoutRole.dashboardFieldRadius.points)
    )
    .padding(.horizontal, LayoutRole.screenInset.points)
    .padding(.top, LayoutRole.dashboardFieldTop.points)
  }
}

public enum DashboardEmptyIllustration: Sendable {
  case content
  case stats

  var illustration: Illustration {
    switch self {
    case .content: .clapperboard
    case .stats: .barChart
    }
  }

  var gap: LayoutRole {
    switch self {
    case .content: .dashboardEmptyClapperboardGap
    case .stats: .dashboardEmptyBarChartGap
    }
  }

  var top: CGFloat {
    LayoutRole.dashboardEmptyTop.points - illustration.size.height - gap.points
  }
}

public struct DashboardEmptyState: View {
  private let message: String
  private let illustration: DashboardEmptyIllustration

  public init(message: String, illustration: DashboardEmptyIllustration) {
    self.message = message
    self.illustration = illustration
  }

  public var body: some View {
    VStack(spacing: illustration.gap.points) {
      IllustrationImage(illustration.illustration)
      Text(verbatim: message)
        .font(TextRole.dashboardEmpty.font)
        .foregroundStyle(DashboardStyle.emptyForeground.color)
        .multilineTextAlignment(.center)
        .frame(maxWidth: LayoutRole.dashboardEmptyWidth.points)
    }
    .padding(.top, illustration.top)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  }
}
