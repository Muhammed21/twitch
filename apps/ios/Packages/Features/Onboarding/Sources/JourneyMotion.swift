import SwiftUI

public enum JourneyMotion {
  public static let pageResponse: TimeInterval = 0.5
  public static let pageDamping: Double = 0.86
  public static let fadeDuration: TimeInterval = 0.2

  public static func page(reduceMotion: Bool) -> Animation {
    reduceMotion
      ? .easeInOut(duration: fadeDuration)
      : .spring(response: pageResponse, dampingFraction: pageDamping)
  }

  public static func pageEdges(direction: JourneyDirection) -> (insertion: Edge, removal: Edge) {
    switch direction {
    case .forward: (.trailing, .leading)
    case .backward: (.leading, .trailing)
    }
  }

  public static func pageTransition(direction: JourneyDirection, reduceMotion: Bool) -> AnyTransition {
    guard !reduceMotion else { return .opacity }
    let edges = pageEdges(direction: direction)
    return .asymmetric(
      insertion: .move(edge: edges.insertion).combined(with: .opacity),
      removal: .move(edge: edges.removal).combined(with: .opacity)
    )
  }
}
