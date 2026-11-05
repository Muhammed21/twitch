import SwiftUI

struct JourneyEntrance: ViewModifier {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var isShown = false
  let index: Int
  let isFinalOnReducedMotion: Bool

  func body(content: Content) -> some View {
    content
      .opacity(isShown ? 1 : 0)
      .offset(y: JourneyMotion.entranceOffset(isShown: isShown, reduceMotion: reduceMotion))
      .onAppear {
        guard !(isFinalOnReducedMotion && JourneyMotion.startsRevealed(reduceMotion: reduceMotion)) else {
          isShown = true
          return
        }
        withAnimation(JourneyMotion.entrance(index: index, reduceMotion: reduceMotion)) {
          isShown = true
        }
      }
  }
}

extension View {
  func journeyEntrance(_ index: Int, isFinalOnReducedMotion: Bool = false) -> some View {
    modifier(JourneyEntrance(index: index, isFinalOnReducedMotion: isFinalOnReducedMotion))
  }
}
