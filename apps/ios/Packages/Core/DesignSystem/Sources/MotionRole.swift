import DesignTokens
import SwiftUI

public enum MotionRole: Sendable {
  case journeyPage
  case fade

  public func animation(reduceMotion: Bool) -> Animation {
    switch (self, reduceMotion) {
    case (.journeyPage, false): .smooth(duration: Motion.journeyPage)
    case (.journeyPage, true), (.fade, _): .easeInOut(duration: Motion.fade)
    }
  }
}
