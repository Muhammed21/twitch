import DesignSystem
import Foundation
import Testing

private func frame(at elapsed: TimeInterval, reduceMotion: Bool = false) -> SplashFrame {
  SplashTimeline.frame(at: elapsed, reduceMotion: reduceMotion)
}

private func isClose(_ lhs: SplashFrame, _ rhs: SplashFrame) -> Bool {
  [
    lhs.outline - rhs.outline,
    lhs.fill - rhs.fill,
    lhs.eyes - rhs.eyes,
    lhs.eyeScale - rhs.eyeScale,
    lhs.scale - rhs.scale,
    lhs.opacity - rhs.opacity,
  ]
  .allSatisfy { abs($0) < 1e-9 }
}

private let blank = SplashFrame(outline: 0, fill: 0, eyes: 0, eyeScale: 1, scale: 1, opacity: 1)
private let fullLogo = SplashFrame(outline: 1, fill: 1, eyes: 1, eyeScale: 1, scale: 1, opacity: 1)

private let animatedCases: [(TimeInterval, SplashFrame)] = [
  (0.0, blank),
  (0.3, SplashFrame(outline: 0.5, fill: 0, eyes: 0, eyeScale: 1, scale: 1, opacity: 1)),
  (0.6, SplashFrame(outline: 1, fill: 0, eyes: 0, eyeScale: 1, scale: 1, opacity: 1)),
  (0.65, SplashFrame(outline: 1, fill: 0.5, eyes: 0, eyeScale: 1, scale: 1, opacity: 1)),
  (0.7, SplashFrame(outline: 1, fill: 1, eyes: 0, eyeScale: 1, scale: 1, opacity: 1)),
  (0.8, SplashFrame(outline: 1, fill: 1, eyes: 0.5, eyeScale: 1, scale: 1, opacity: 1)),
  (0.9, fullLogo),
  (0.95, SplashFrame(outline: 1, fill: 1, eyes: 1, eyeScale: 0.55, scale: 1, opacity: 1)),
  (1.0, SplashFrame(outline: 1, fill: 1, eyes: 1, eyeScale: 0.1, scale: 1, opacity: 1)),
  (1.05, SplashFrame(outline: 1, fill: 1, eyes: 1, eyeScale: 0.55, scale: 1, opacity: 1)),
  (1.1, fullLogo),
  (1.25, SplashFrame(outline: 1, fill: 1, eyes: 1, eyeScale: 1, scale: 1.05, opacity: 0.5)),
  (1.4, SplashFrame(outline: 1, fill: 1, eyes: 1, eyeScale: 1, scale: 1.1, opacity: 0)),
]

private let reducedMotionCases: [(TimeInterval, SplashFrame)] = [
  (0.0, fullLogo),
  (1.0, fullLogo),
  (1.1, fullLogo),
  (1.25, SplashFrame(outline: 1, fill: 1, eyes: 1, eyeScale: 1, scale: 1, opacity: 0.5)),
  (1.4, SplashFrame(outline: 1, fill: 1, eyes: 1, eyeScale: 1, scale: 1, opacity: 0)),
]

@Suite("Chronologie de la splash screen")
struct SplashTimelineTests {
  @Test("dure 1,4 s")
  func duration() {
    #expect(SplashTimeline.duration == 1.4)
  }

  @Test(
    "trace le contour, remplit la bulle, fait apparaître les yeux, cligne, puis grossit en s'effaçant",
    arguments: animatedCases
  )
  func animated(elapsed: TimeInterval, expected: SplashFrame) {
    #expect(isClose(frame(at: elapsed), expected))
  }

  @Test("reste sur la première image avant le départ et sur la dernière après la fin")
  func clamped() {
    #expect(isClose(frame(at: -1), blank))
    #expect(isClose(frame(at: 5), frame(at: SplashTimeline.duration)))
  }

  @Test(
    "avec Réduire les animations, montre le logo fixe puis s'efface sans grossir",
    arguments: reducedMotionCases
  )
  func reducedMotion(elapsed: TimeInterval, expected: SplashFrame) {
    #expect(isClose(frame(at: elapsed, reduceMotion: true), expected))
  }
}
