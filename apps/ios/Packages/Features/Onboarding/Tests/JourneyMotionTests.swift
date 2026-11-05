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

  @Test("les éléments d'une page entrent l'un après l'autre, décalés de 0,06 s, en remontant de 24 pt")
  func entrance() {
    #expect(JourneyMotion.stagger == 0.06)
    #expect(JourneyMotion.entranceDistance == 24)
    #expect(JourneyMotion.entrance(index: 0, reduceMotion: false) == .spring(response: 0.5, dampingFraction: 0.86).delay(0))
    #expect(JourneyMotion.entrance(index: 3, reduceMotion: false) == .spring(response: 0.5, dampingFraction: 0.86).delay(0.18))
    #expect(JourneyMotion.entranceOffset(isShown: false, reduceMotion: false) == 24)
    #expect(JourneyMotion.entranceOffset(isShown: true, reduceMotion: false) == 0)
  }

  @Test("avec Réduire les animations, une entrée est un fondu court sans décalage ni déplacement", arguments: [0, 3])
  func entranceReduced(index: Int) {
    #expect(JourneyMotion.entrance(index: index, reduceMotion: true) == .easeInOut(duration: 0.2))
    #expect(JourneyMotion.entranceOffset(isShown: false, reduceMotion: true) == 0)
  }

  @Test("le récap s'anime ; avec Réduire les animations, il s'affiche dans son état final")
  func summaryRevealed() {
    #expect(!JourneyMotion.startsRevealed(reduceMotion: false))
    #expect(JourneyMotion.startsRevealed(reduceMotion: true))
  }

  @Test("un choix réagit par un ressort court de 0,3 s ; avec Réduire les animations, le même fondu")
  func selection() {
    #expect(JourneyMotion.selectionResponse == 0.3)
    #expect(JourneyMotion.selection(reduceMotion: false) == .spring(response: 0.3, dampingFraction: 0.86))
    #expect(JourneyMotion.selection(reduceMotion: true) == .easeInOut(duration: 0.2))
  }
}
