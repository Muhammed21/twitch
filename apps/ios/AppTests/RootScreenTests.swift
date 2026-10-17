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
    #expect(RootScreen(isSplashVisible: true, phase: phase, isGreetingNewAccount: false) == .splash)
  }

  @Test("après le splash, le splash reste tant que la session n'est pas résolue")
  func launching() {
    #expect(RootScreen(isSplashVisible: false, phase: .launching, isGreetingNewAccount: false) == .splash)
  }

  @Test(
    "déconnecté, ou pendant la feuille de connexion, l'app montre l'accueil",
    arguments: [SessionPhase.signedOut, .signingIn]
  )
  func welcome(phase: SessionPhase) {
    #expect(RootScreen(isSplashVisible: false, phase: phase, isGreetingNewAccount: false) == .welcome)
  }

  @Test(
    "connecté, avec ou sans compte chargé, l'app montre l'écran connecté",
    arguments: [SessionPhase.signedIn(viewer), .signedIn(nil)]
  )
  func signedIn(phase: SessionPhase) {
    #expect(RootScreen(isSplashVisible: false, phase: phase, isGreetingNewAccount: false) == .signedIn)
  }

  @Test(
    "après une inscription, l'app montre « You're All Set! » avant l'écran connecté",
    arguments: [SessionPhase.signedIn(viewer), .signedIn(nil)]
  )
  func allSet(phase: SessionPhase) {
    #expect(RootScreen(isSplashVisible: false, phase: phase, isGreetingNewAccount: true) == .allSet)
  }

  @Test("le splash passe avant « You're All Set! »")
  func splashBeforeAllSet() {
    #expect(RootScreen(isSplashVisible: true, phase: .signedIn(viewer), isGreetingNewAccount: true) == .splash)
  }

  @Test("Log In de l'accueil demande la connexion, Sign Up l'inscription")
  func intents() {
    #expect(AuthorizationIntent(WelcomeIntent.logIn) == .signIn)
    #expect(AuthorizationIntent(WelcomeIntent.signUp) == .signUp)
  }
}
