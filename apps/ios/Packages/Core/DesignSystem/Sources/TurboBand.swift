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
      .frame(height: LayoutRole.paywallBandHeight.points)
      .accessibilityHidden(true)
  }
}
