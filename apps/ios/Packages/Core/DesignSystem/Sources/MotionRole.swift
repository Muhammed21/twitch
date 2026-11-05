import DesignTokens
import SwiftUI

public enum MotionRole: Sendable {
  case journeyPage
  case fade

  public func animation(reduceMotion: Bool) -> Animation {
    switch (self, reduceMotion) {
    case (.journeyPage, false): .smooth(duration: Motion.journeyPage)
    case (.journeyPage, true): .easeInOut(duration: Motion.journeyPageReduced)
    case (.fade, _): .easeInOut(duration: Motion.fade)
    }
  }
}

private struct MotionRoleAnimation<Value: Equatable>: ViewModifier {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let role: MotionRole
  let value: Value

  func body(content: Content) -> some View {
    content.animation(role.animation(reduceMotion: reduceMotion), value: value)
  }
}

public extension View {
  func animation(_ role: MotionRole, value: some Equatable) -> some View {
    modifier(MotionRoleAnimation(role: role, value: value))
  }
}
