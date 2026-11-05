import Onboarding
import SwiftUI
import Testing

@Suite("Transitions entre les pages du parcours")
struct JourneyMotionTests {
  @Test("une page arrive par un ressort de 0,5 s amorti à 0,86 ; avec Réduire les animations, un fondu de 0,2 s")
  func timings() {
    #expect(JourneyMotion.pageResponse == 0.5)
    #expect(JourneyMotion.pageDamping == 0.86)
    #expect(JourneyMotion.fadeDuration == 0.2)
    #expect(JourneyMotion.page(reduceMotion: false) == .spring(response: 0.5, dampingFraction: 0.86))
    #expect(JourneyMotion.page(reduceMotion: true) == .easeInOut(duration: 0.2))
  }

  @Test("en avançant, la page entre par la droite et sort par la gauche ; en revenant, l'inverse")
  func edges() {
    #expect(JourneyMotion.pageEdges(direction: .forward) == (.trailing, .leading))
    #expect(JourneyMotion.pageEdges(direction: .backward) == (.leading, .trailing))
  }
}
