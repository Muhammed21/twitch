import SwiftUI

public enum JourneyStyle {
  public static let title = ColorRole.textPrimary
  public static let message = ColorRole.textSecondary
  public static let control = ColorRole.textPrimary
  public static let skip = ColorRole.link
  public static let progressTrack = ColorRole.surfaceSecondary
  public static let progressFill = ColorRole.accent
  public static let mark = ColorRole.accent
  public static let card = ColorRole.surface
  public static let choiceName = ColorRole.textPrimary
  public static let choiceDetail = ColorRole.textSecondary
  public static let choiceDivider = ColorRole.border
  public static let selected = ColorRole.accent
  public static let unselected = ColorRole.textSecondary
  public static let chip = ColorRole.surface
  public static let chipLabel = ColorRole.textPrimary
  public static let chipSelected = ColorRole.accent
  public static let chipSelectedLabel = ColorRole.onAccent
}

public struct JourneyProgressBar: View {
  private let progress: Double

  public init(progress: Double) {
    self.progress = progress
  }

  public static func filledFraction(_ progress: Double) -> Double {
    min(max(progress, 0), 1)
  }

  public var body: some View {
    GeometryReader { proxy in
      Capsule()
        .fill(JourneyStyle.progressTrack.color)
        .overlay(alignment: .leading) {
          Capsule()
            .fill(JourneyStyle.progressFill.color)
            .frame(width: proxy.size.width * Self.filledFraction(progress))
        }
    }
    .frame(height: LayoutRole.journeyProgressHeight.points)
    .accessibilityElement()
    .accessibilityValue(Text(Self.filledFraction(progress), format: .percent.precision(.fractionLength(0))))
  }
}

public struct GlitchMark: View {
  public init() {}

  public var body: some View {
    ZStack {
      GlitchBubble()
        .fill(JourneyStyle.mark.color, style: FillStyle(eoFill: true))
      GlitchEyes()
        .fill(JourneyStyle.mark.color)
    }
    .aspectRatio(GlitchViewBox.size, contentMode: .fit)
    .accessibilityHidden(true)
  }
}
