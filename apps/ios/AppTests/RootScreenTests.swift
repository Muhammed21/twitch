import Auth
import Domain
import Foundation
import Networking
import Onboarding
import Testing
@testable import Twitch

private let viewer = Account(id: UUID(), name: "viewer_dev", email: "viewer@twitch.local")

@Suite("Routage racine : splash, accueil ou écran connecté")
struct RootScreenTests {
  @Test(
    "le splash reste affiché tant que son animation tourne, quelle que soit la session",
    arguments: [SessionPhase.launching, .signedOut, .signedIn(viewer)]
  )
  func splashFirst(phase: SessionPhase) {
    #expect(RootScreen(isSplashVisible: true, phase: phase, isGreetingNewAccount: false, isUpdateRequired: false) == .splash)
  }

  @Test("après le splash, le splash reste tant que la session n'est pas résolue")
  func launching() {
    #expect(RootScreen(isSplashVisible: false, phase: .launching, isGreetingNewAccount: false, isUpdateRequired: false) == .splash)
  }

  @Test(
    "déconnecté, ou pendant la feuille de connexion, l'app montre l'accueil",
    arguments: [SessionPhase.signedOut, .signingIn]
  )
  func welcome(phase: SessionPhase) {
    #expect(RootScreen(isSplashVisible: false, phase: phase, isGreetingNewAccount: false, isUpdateRequired: false) == .welcome)
  }

  @Test(
    "connecté, avec ou sans compte chargé, l'app montre l'écran connecté",
    arguments: [SessionPhase.signedIn(viewer), .signedIn(nil)]
  )
  func signedIn(phase: SessionPhase) {
    #expect(RootScreen(isSplashVisible: false, phase: phase, isGreetingNewAccount: false, isUpdateRequired: false) == .signedIn)
  }

  @Test(
    "après une inscription, l'app montre « You're All Set! » avant l'écran connecté",
    arguments: [SessionPhase.signedIn(viewer), .signedIn(nil)]
  )
  func allSet(phase: SessionPhase) {
    #expect(RootScreen(isSplashVisible: false, phase: phase, isGreetingNewAccount: true, isUpdateRequired: false) == .allSet)
  }

  @Test(
    "après « You're All Set! », une inscription mène au parcours de personnalisation",
    arguments: [SessionPhase.signedIn(viewer), .signedIn(nil)]
  )
  func personalization(phase: SessionPhase) {
    let screen = RootScreen(
      isSplashVisible: false, phase: phase, isGreetingNewAccount: false, isUpdateRequired: false, isPersonalizationDue: true
    )
    #expect(screen == .personalization)
  }

  @Test("« You're All Set! » passe avant le parcours, et le splash avant tout")
  func personalizationOrder() {
    #expect(RootScreen(
      isSplashVisible: false, phase: .signedIn(viewer), isGreetingNewAccount: true, isUpdateRequired: false, isPersonalizationDue: true
    ) == .allSet)
    #expect(RootScreen(
      isSplashVisible: true, phase: .signedIn(viewer), isGreetingNewAccount: false, isUpdateRequired: false, isPersonalizationDue: true
    ) == .splash)
  }

  @Test("le parcours est dû après une inscription, sauf si ce compte l'a déjà terminé sur l'appareil")
  func personalizationDue() {
    let finished = UUID()
    let completed: (UUID) -> Bool = { $0 == finished }

    #expect(RootScreen.isPersonalizationDue(isPersonalizing: true, account: viewer.id, hasCompleted: completed))
    #expect(RootScreen.isPersonalizationDue(isPersonalizing: true, account: nil, hasCompleted: completed))
    #expect(!RootScreen.isPersonalizationDue(isPersonalizing: true, account: finished, hasCompleted: completed))
    #expect(!RootScreen.isPersonalizationDue(isPersonalizing: false, account: viewer.id, hasCompleted: completed))
  }

  @Test("le parcours s'ouvre sur l'intro et se termine sur le récap")
  func personalizationSteps() {
    #expect(PersonalizationRoot.steps.first == .intro)
    #expect(PersonalizationRoot.steps.last == .summary)
  }

  @Test("le splash passe avant « You're All Set! »")
  func splashBeforeAllSet() {
    #expect(RootScreen(isSplashVisible: true, phase: .signedIn(viewer), isGreetingNewAccount: true, isUpdateRequired: false) == .splash)
  }

  @Test(
    "après le splash, une version non supportée montre l'écran de mise à jour, quelle que soit la session",
    arguments: [SessionPhase.launching, .signedOut, .signingIn, .signedIn(viewer)]
  )
  func updateRequired(phase: SessionPhase) {
    #expect(RootScreen(isSplashVisible: false, phase: phase, isGreetingNewAccount: true, isUpdateRequired: true) == .updateRequired)
    #expect(RootScreen(isSplashVisible: true, phase: phase, isGreetingNewAccount: false, isUpdateRequired: true) == .splash)
  }

  @Test(
    "quitter la session vide la pile de navigation ; un deep link reçu avant la connexion est gardé",
    arguments: [
      (SessionPhase.signedIn(viewer), SessionPhase.signedOut, true),
      (.signedIn(nil), .signedOut, true),
      (.signedOut, .signingIn, false),
      (.signingIn, .signedIn(viewer), false),
      (.launching, .signedIn(nil), false),
      (.signedIn(nil), .signedIn(viewer), false),
    ]
  )
  func navigationReset(from old: SessionPhase, to new: SessionPhase, resets: Bool) {
    #expect(RootScreen.resetsNavigation(from: old, to: new) == resets)
  }

  @Test("Log In de l'accueil demande la connexion, Sign Up l'inscription")
  func intents() {
    #expect(AuthorizationIntent(WelcomeIntent.logIn) == .signIn)
    #expect(AuthorizationIntent(WelcomeIntent.signUp) == .signUp)
  }
}
