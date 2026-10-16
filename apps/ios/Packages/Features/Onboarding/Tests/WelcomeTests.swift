import DesignSystem
import Foundation
import Onboarding
import Testing

private let captureLeadingEnds = ["NT", "ve", "ws", "all", "dly", "ng", "ng", "als"]
private let captureTrailingStarts = [
  "Call of Duty: Mo", "Electronic Punk A", "History Edu", "Baseball Soccer",
  "Anim", "News Me", "Social Eat", "Sports C",
]

private func isClose(_ lhs: CGFloat, _ rhs: CGFloat) -> Bool {
  abs(lhs - rhs) < 1e-9
}

@Suite("Accueil, fidèle à onboarding/accueil-bienvenue--defaut")
struct WelcomeTests {
  @Test("montre les huit catégories principales de la capture, dans l'ordre")
  func mainCategories() {
    #expect(WelcomeContent.rows.map(\.main) == [
      "Games", "Music", "Talk Shows", "Sports",
      "Travel & Outdoors", "Just Chatting", "Food & Drink", "Special Events",
    ])
  }

  @Test("les catégories coupées à gauche finissent comme sur la capture")
  func leadingFragments() {
    #expect(WelcomeContent.rows.count == captureLeadingEnds.count)
    #expect(zip(WelcomeContent.rows, captureLeadingEnds).allSatisfy { $0.leading.hasSuffix($1) })
  }

  @Test("les catégories coupées à droite commencent comme sur la capture")
  func trailingFragments() {
    #expect(WelcomeContent.rows.count == captureTrailingStarts.count)
    #expect(zip(WelcomeContent.rows, captureTrailingStarts).allSatisfy { $0.trailing.hasPrefix($1) })
  }

  @Test("Log In, à gauche sur violet clair, demande la connexion ; Sign Up, à droite sur blanc, l'inscription")
  func actions() {
    #expect(WelcomeContent.actions == [
      WelcomeAction(title: "Log In", kind: .secondaryOnAccent, intent: .logIn),
      WelcomeAction(title: "Sign Up", kind: .primaryOnAccent, intent: .signUp),
    ])
  }

  @Test("le slogan et les boutons reprennent les textes anglais de la capture")
  func texts() {
    #expect(WelcomeText.slogan == "There's something\nfor you on Twitch")
    #expect(WelcomeText.logIn == "Log In")
    #expect(WelcomeText.signUp == "Sign Up")
  }
}

@Suite("Entrée animée des catégories")
struct WelcomeEntranceTests {
  @Test("dure 0,6 s par ligne, chaque ligne partant 0,05 s après la précédente")
  func timing() {
    #expect(WelcomeEntrance.rowDuration == 0.6)
    #expect(WelcomeEntrance.stagger == 0.05)
  }

  @Test("l'animation s'arrête quand la dernière ligne est posée : 0,95 s pour les huit lignes")
  func totalDuration() {
    #expect(abs(WelcomeEntrance.duration(rows: WelcomeContent.rows.count) - 0.95) < 1e-9)
    #expect(isClose(WelcomeEntrance.offset(row: 7, at: 0.95, distance: 400, reduceMotion: false), 0))
  }

  @Test("une ligne sur deux arrive de la gauche, l'autre de la droite, d'une largeur d'écran")
  func startOffsets() {
    #expect(isClose(WelcomeEntrance.offset(row: 0, at: 0, distance: 400, reduceMotion: false), -400))
    #expect(isClose(WelcomeEntrance.offset(row: 1, at: 0, distance: 400, reduceMotion: false), 400))
    #expect(isClose(WelcomeEntrance.offset(row: 2, at: 0, distance: 400, reduceMotion: false), -400))
  }

  @Test("une ligne attend son tour, ralentit en arrivant et se pose sur la composition de la capture")
  func easing() {
    #expect(isClose(WelcomeEntrance.offset(row: 3, at: 0.15, distance: 400, reduceMotion: false), 400))
    #expect(isClose(WelcomeEntrance.offset(row: 0, at: 0.3, distance: 400, reduceMotion: false), -50))
    #expect(isClose(WelcomeEntrance.offset(row: 1, at: 0.35, distance: 400, reduceMotion: false), 50))
    #expect(isClose(WelcomeEntrance.offset(row: 7, at: 0.95, distance: 400, reduceMotion: false), 0))
    #expect(isClose(WelcomeEntrance.offset(row: 7, at: 5, distance: 400, reduceMotion: false), 0))
  }

  @Test("avec Réduire les animations, les lignes sont posées dès le départ")
  func reducedMotion() {
    #expect(isClose(WelcomeEntrance.offset(row: 0, at: 0, distance: 400, reduceMotion: true), 0))
    #expect(isClose(WelcomeEntrance.offset(row: 1, at: 0, distance: 400, reduceMotion: true), 0))
  }
}
