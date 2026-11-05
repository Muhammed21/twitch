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

  public var points: CGFloat {
    switch self {
    case .bandHeight: Spacing.x72
    case .headlineTop: Spacing.x12
    case .legalGap: Spacing.x12
    case .markSize: Spacing.x36
    case .savingsPaddingH: Spacing.x6
    case .savingsPaddingV: Spacing.x2
    }
  }
}
