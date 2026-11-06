import DesignTokens
import SwiftUI

struct TurboWave: Shape {
  func path(in rect: CGRect) -> Path {
    Path { path in
      path.move(to: CGPoint(x: rect.minX, y: rect.minY))
      path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
      path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
      path.addQuadCurve(
        to: CGPoint(x: rect.midX, y: rect.maxY),
        control: CGPoint(x: rect.maxX * 0.75, y: rect.maxY)
      )
      path.addQuadCurve(
        to: CGPoint(x: rect.minX, y: rect.maxY),
        control: CGPoint(x: rect.maxX * 0.25, y: rect.maxY)
      )
      path.closeSubpath()
    }
  }
}

public struct TurboBand: View {
  public init() {}

  public var body: some View {
    TurboWave()
      .fill(TurboGradient.fill)
      .frame(height: PaywallLayout.bandHeight.points)
      .accessibilityHidden(true)
  }
}

public enum TurboGradient {
  public static let fill = LinearGradient(
    colors: [ColorRole.turboStart.color, ColorRole.turboEnd.color],
    startPoint: .topLeading,
    endPoint: .bottomTrailing
  )
}

public enum PaywallLayout: CaseIterable, Sendable {
  case bandHeight
  case headlineTop
  case legalGap
  case markSize
  case savingsPaddingH
  case savingsPaddingV
  case taglineTop
  case subscribeTop
  case subscribePaddingH
  case subscribeIconGap
  case subscribeIconSize
  case subscribeRadius
  case finePrintTop
  case finePrintGap
  case perksTop
  case perkGap
  case perkPaddingV
  case perkPaddingLeading
  case perkPaddingTrailing
  case perkIllustrationWidth
  case perkTitleGap
  case perkRadius

  public var points: CGFloat {
    switch self {
    case .bandHeight: Spacing.x72
    case .headlineTop: Spacing.x12
    case .legalGap: Spacing.x12
    case .markSize: Spacing.x36
    case .savingsPaddingH: Spacing.x6
    case .savingsPaddingV: Spacing.x2
    case .taglineTop: Spacing.x16
    case .subscribeTop: Spacing.x16
    case .subscribePaddingH: Spacing.x12
    case .subscribeIconGap: Spacing.x12
    case .subscribeIconSize: Spacing.x24
    case .subscribeRadius: Radius.md
    case .finePrintTop: Spacing.x8
    case .finePrintGap: Spacing.x8
    case .perksTop: Spacing.x20
    case .perkGap: Spacing.x8
    case .perkPaddingV: Spacing.x12
    case .perkPaddingLeading: Spacing.x6
    case .perkPaddingTrailing: Spacing.x12
    case .perkIllustrationWidth: Spacing.x70
    case .perkTitleGap: Spacing.x4
    case .perkRadius: Radius.lg
    }
  }
}
