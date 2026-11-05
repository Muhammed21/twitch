import DesignSystem
import Onboarding
import SwiftUI
import Testing

@Suite("Transitions entre les pages du parcours")
struct JourneyMotionTests {
  @Test("les éléments du récap remontent par un ressort de 0,5 s amorti à 0,86 ; avec Réduire les animations, le fondu du design system")
  func timings() {
    #expect(JourneyMotion.pageResponse == 0.5)
    #expect(JourneyMotion.pageDamping == 0.86)
    #expect(JourneyMotion.selection(reduceMotion: true) == MotionRole.fade.animation(reduceMotion: true))
    #expect(JourneyMotion.entrance(index: 3, reduceMotion: true) == MotionRole.fade.animation(reduceMotion: true))
  }

  @Test("une page affichée reste en place, quel que soit le sens", arguments: [JourneyDirection.forward, .backward])
  func shiftAtRest(direction: JourneyDirection) {
    #expect(JourneyMotion.pageShift(phase: .identity, direction: direction, reduceMotion: false) == 0)
  }

  @Test("en avançant, la page arrive d'une largeur à droite et la page quittée sort d'une largeur à gauche, comme un push")
  func shiftForward() {
    #expect(JourneyMotion.pageShift(phase: .willAppear, direction: .forward, reduceMotion: false) == 1)
    #expect(JourneyMotion.pageShift(phase: .didDisappear, direction: .forward, reduceMotion: false) == -1)
  }

  @Test("en revenant, la page arrive d'une largeur à gauche et la page quittée sort d'une largeur à droite, comme un pop")
  func shiftBackward() {
    #expect(JourneyMotion.pageShift(phase: .willAppear, direction: .backward, reduceMotion: false) == -1)
    #expect(JourneyMotion.pageShift(phase: .didDisappear, direction: .backward, reduceMotion: false) == 1)
  }

  @Test(
    "avec Réduire les animations, aucune page ne glisse",
    arguments: [TransitionPhase.willAppear, .identity, .didDisappear], [JourneyDirection.forward, .backward]
  )
  func shiftReduced(phase: TransitionPhase, direction: JourneyDirection) {
    #expect(JourneyMotion.pageShift(phase: phase, direction: direction, reduceMotion: true) == 0)
  }

  @Test("une page qui glisse reste opaque : les deux pages se suivent bord à bord, sans se voir l'une à travers l'autre")
  func opacitySliding() {
    #expect(JourneyMotion.pageOpacity(phase: .willAppear, reduceMotion: false) == 1)
    #expect(JourneyMotion.pageOpacity(phase: .didDisappear, reduceMotion: false) == 1)
  }

  @Test("avec Réduire les animations, la page qui arrive et celle qui part se fondent ; la page affichée est opaque")
  func opacityReduced() {
    #expect(JourneyMotion.pageOpacity(phase: .willAppear, reduceMotion: true) == 0)
    #expect(JourneyMotion.pageOpacity(phase: .didDisappear, reduceMotion: true) == 0)
    #expect(JourneyMotion.pageOpacity(phase: .identity, reduceMotion: true) == 1)
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
