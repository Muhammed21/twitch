import DesignSystem
import SwiftUI
import Testing

@Suite("Mouvement : durées et courbes issues des tokens")
struct MotionRoleTests {
  @Test("une page du parcours glisse en 0,35 s sur une courbe douce sans rebond, comme un push de navigation")
  func journeyPage() {
    #expect(MotionRole.journeyPage.animation(reduceMotion: false) == .smooth(duration: 0.35))
  }

  @Test("le fondu dure 0,2 s, avec ou sans Réduire les animations", arguments: [false, true])
  func fade(reduceMotion: Bool) {
    #expect(MotionRole.fade.animation(reduceMotion: reduceMotion) == .easeInOut(duration: 0.2))
  }

  @Test("avec Réduire les animations, un glissement devient le fondu court")
  func reduced() {
    #expect(MotionRole.journeyPage.animation(reduceMotion: true) == .easeInOut(duration: 0.2))
  }
}
