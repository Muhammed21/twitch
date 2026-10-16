import SwiftUI

public struct SplashScreen: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var start = Date.now
  private let onFinished: @MainActor () -> Void

  public init(onFinished: @escaping @MainActor () -> Void) {
    self.onFinished = onFinished
  }

  public var body: some View {
    TimelineView(.animation) { context in
      let frame = SplashTimeline.frame(at: context.date.timeIntervalSince(start), reduceMotion: reduceMotion)
      ZStack {
        ColorRole.accent.color
        ZStack {
          GlitchBubble()
            .trim(from: 0, to: frame.outline)
            .stroke(ColorRole.onAccent.color, lineWidth: 2)
            .opacity(frame.stroke)
          GlitchBubble()
            .fill(ColorRole.onAccent.color, style: FillStyle(eoFill: true))
            .opacity(frame.fill)
          GlitchEyes()
            .fill(ColorRole.onAccent.color)
            .opacity(frame.eyes)
            .scaleEffect(x: 1, y: frame.eyeScale, anchor: GlitchEyes.blinkAnchor)
        }
        .frame(width: 96, height: 112)
        .scaleEffect(frame.scale)
      }
      .ignoresSafeArea()
      .opacity(frame.opacity)
    }
    .accessibilityHidden(true)
    .task {
      try? await Task.sleep(for: .seconds(SplashTimeline.duration))
      onFinished()
    }
  }
}
