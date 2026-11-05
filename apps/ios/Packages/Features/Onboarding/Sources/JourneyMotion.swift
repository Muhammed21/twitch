import DesignSystem
import SwiftUI

public enum JourneyMotion {
  public static let pageResponse: TimeInterval = 0.5
  public static let pageDamping: Double = 0.86
  public static let selectionResponse: TimeInterval = 0.3
  public static let stagger: TimeInterval = 0.06
  public static let entranceDistance: CGFloat = 24

  public static func entrance(index: Int, reduceMotion: Bool) -> Animation {
    reduceMotion
      ? MotionRole.fade.animation(reduceMotion: true)
      : .spring(response: pageResponse, dampingFraction: pageDamping).delay(Double(index) * stagger)
  }

  public static func entranceOffset(isShown: Bool, reduceMotion: Bool) -> CGFloat {
    isShown || reduceMotion ? 0 : entranceDistance
  }

  public static func startsRevealed(reduceMotion: Bool) -> Bool {
    reduceMotion
  }

  public static func selection(reduceMotion: Bool) -> Animation {
    reduceMotion
      ? MotionRole.fade.animation(reduceMotion: true)
      : .spring(response: selectionResponse, dampingFraction: pageDamping)
  }

  public static func pageShift(phase: TransitionPhase, direction: JourneyDirection, reduceMotion: Bool) -> CGFloat {
    guard !reduceMotion else { return 0 }
    let ahead: CGFloat = direction == .forward ? 1 : -1
    switch phase {
    case .willAppear: return ahead
    case .didDisappear: return -ahead
    case .identity: return 0
    }
  }

  public static func pageOpacity(phase: TransitionPhase, reduceMotion: Bool) -> Double {
    reduceMotion && !phase.isIdentity ? 0 : 1
  }
}

struct JourneyPageTransition: Transition {
  let journey: PersonalizationJourney
  let reduceMotion: Bool

  func body(content: Content, phase: TransitionPhase) -> some View {
    let shift = JourneyMotion.pageShift(phase: phase, direction: journey.direction, reduceMotion: reduceMotion)
    content
      .visualEffect { effect, proxy in
        effect.offset(x: shift * proxy.size.width)
      }
      .opacity(JourneyMotion.pageOpacity(phase: phase, reduceMotion: reduceMotion))
  }
}
