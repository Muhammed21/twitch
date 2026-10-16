import Foundation

public struct SplashFrame: Equatable, Sendable {
  public let outline: Double
  public let fill: Double
  public let eyes: Double
  public let eyeScale: Double
  public let scale: Double
  public let opacity: Double

  public var stroke: Double { 1 - fill }

  public init(outline: Double, fill: Double, eyes: Double, eyeScale: Double, scale: Double, opacity: Double) {
    self.outline = outline
    self.fill = fill
    self.eyes = eyes
    self.eyeScale = eyeScale
    self.scale = scale
    self.opacity = opacity
  }
}

public enum SplashTimeline {
  public static let duration: TimeInterval = 1.4

  private static let closedEyeScale = 0.1
  private static let exitGrowth = 0.1

  public static func frame(at elapsed: TimeInterval, reduceMotion: Bool) -> SplashFrame {
    let exit = progress(elapsed, from: 1.1, to: duration)
    guard !reduceMotion else {
      return SplashFrame(outline: 1, fill: 1, eyes: 1, eyeScale: 1, scale: 1, opacity: 1 - exit)
    }
    let blink = 1 - abs(progress(elapsed, from: 0.9, to: 1.1) * 2 - 1)
    return SplashFrame(
      outline: progress(elapsed, from: 0, to: 0.6),
      fill: progress(elapsed, from: 0.6, to: 0.7),
      eyes: progress(elapsed, from: 0.7, to: 0.9),
      eyeScale: 1 - blink * (1 - closedEyeScale),
      scale: 1 + exit * exitGrowth,
      opacity: 1 - exit
    )
  }

  private static func progress(_ elapsed: TimeInterval, from start: TimeInterval, to end: TimeInterval) -> Double {
    min(max((elapsed - start) / (end - start), 0), 1)
  }
}
