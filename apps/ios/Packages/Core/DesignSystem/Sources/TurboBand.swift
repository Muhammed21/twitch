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
      .fill(
        LinearGradient(
          colors: [ColorRole.turboStart.color, ColorRole.turboEnd.color],
          startPoint: .topLeading,
          endPoint: .bottomTrailing
        )
      )
      .frame(height: PaywallLayout.bandHeight.points)
      .accessibilityHidden(true)
  }
}

public enum PaywallLayout: CaseIterable, Sendable {
  case bandHeight
  case headlineTop
  case taglineGap
  case actionTop
  case buttonInset
  case billingGap
  case packageGap
  case legalGap
  case cardTop
  case cardPadding

  public var points: CGFloat {
    switch self {
    case .bandHeight: Spacing.x72
    case .headlineTop: Spacing.x12
    case .taglineGap: Spacing.x12
    case .actionTop: Spacing.x24
    case .buttonInset: Spacing.x44
    case .billingGap: Spacing.x8
    case .packageGap: Spacing.x16
    case .legalGap: Spacing.x12
    case .cardTop: Spacing.x20
    case .cardPadding: Spacing.x20
    }
  }
}
