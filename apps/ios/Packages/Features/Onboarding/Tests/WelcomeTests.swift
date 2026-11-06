import DesignSystem
import Foundation
import Onboarding
import Testing

private func isClose(_ lhs: CGFloat, _ rhs: CGFloat) -> Bool {
  abs(lhs - rhs) < 1e-9
}

@Suite("Accueil, fidèle à onboarding/accueil-bienvenue--defaut")
struct WelcomeTests {
  @Test("montre les huit catégories principales de la capture, dans l'ordre, en anglais et en français")
  func mainCategories() {
    #expect(WelcomeContent.rows.map(\.main) == [
      shown(english: "Games", french: "Jeux"),
      shown(english: "Music", french: "Musique"),
      shown(english: "Talk Shows", french: "Talk-shows"),
      shown(english: "Sports", french: "Sports"),
      shown(english: "Travel & Outdoors", french: "Voyages"),
      shown(english: "Just Chatting", french: "Discussions"),
      shown(english: "Food & Drink", french: "Cuisine"),
      shown(english: "Special Events", french: "Événements"),
    ])
  }

  @Test("les catégories coupées à gauche reprennent la capture, traduites en français")
  func leadingCategories() {
    #expect(WelcomeContent.rows.map(\.leading) == [
      shown(english: "Fortnite VALORANT", french: "Fortnite VALORANT"),
      shown(english: "Art Creative", french: "Art Créatif"),
      shown(english: "Podcasts Interviews", french: "Podcasts Interviews"),
      shown(english: "Basketball Football", french: "Basket Football américain"),
      shown(english: "Kids Family Friendly", french: "Enfants Tout public"),
      shown(english: "ASMR Co-working", french: "ASMR Coworking"),
      shown(english: "Baking Cooking", french: "Pâtisserie Recettes"),
      shown(english: "Esports Festivals", french: "E-sport Festivals"),
    ])
  }

  @Test("les catégories coupées à droite reprennent la capture, traduites en français")
  func trailingCategories() {
    #expect(WelcomeContent.rows.map(\.trailing) == [
      shown(english: "Call of Duty: Modern Warfare III", french: "Call of Duty: Modern Warfare III"),
      shown(english: "Electronic Punk Ambient", french: "Électro Punk Ambient"),
      shown(english: "History Education Science", french: "Histoire Éducation Sciences"),
      shown(english: "Baseball Soccer Tennis", french: "Baseball Football Tennis"),
      shown(english: "Animals Aquariums", french: "Animaux Aquariums"),
      shown(english: "News Media Politics", french: "Actualités Médias Politique"),
      shown(english: "Social Eating Wine", french: "Repas partagés Vin"),
      shown(english: "Sports Cards Charity", french: "Cartes de sport Caritatif"),
    ])
  }

  @Test("Log In, à gauche sur violet clair, demande la connexion ; Sign Up, à droite sur blanc, l'inscription")
  func actions() {
    #expect(WelcomeContent.actions == [
      WelcomeAction(title: shown(english: "Log In", french: "Se connecter"), kind: .secondaryOnAccent, intent: .logIn),
      WelcomeAction(title: shown(english: "Sign Up", french: "S'inscrire"), kind: .primaryOnAccent, intent: .signUp),
    ])
  }

  @Test("chaque bouton porte l'identifiant que visent les flows Maestro (ADR 0030, §4)")
  func accessibilityIdentifiers() {
    #expect(WelcomeContent.actions.map(\.accessibilityIdentifier) == ["welcome.logIn", "welcome.signUp"])
  }

  @Test("les boutons reprennent les textes de la capture, en anglais et en français")
  func texts() {
    #expect(WelcomeText.logIn == shown(english: "Log In", french: "Se connecter"))
    #expect(WelcomeText.signUp == shown(english: "Sign Up", french: "S'inscrire"))
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
