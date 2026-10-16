import Auth
import AuthenticationServices
import Foundation
import Testing

private let authorizeURL = URL(string: "http://127.0.0.1:3000/auth/oauth2/authorize")!
private let callbackURL = URL(string: "twitch://oauth/callback?code=code-1&state=s")!

@MainActor
@Suite("Feuille d'authentification système")
struct SystemWebAuthenticatorTests {
  @Test("la session web est éphémère : aucun cookie partagé avec Safari (ADR 0039)")
  func ephemeral() {
    let authenticator = SystemWebAuthenticator()

    let session = authenticator.makeSession(url: authorizeURL, callbackScheme: "twitch") { _ in }

    #expect(session.prefersEphemeralWebBrowserSession)
  }

  @Test("la feuille se présente depuis la fenêtre de l'app")
  func presentationContext() {
    let authenticator = SystemWebAuthenticator()

    let session = authenticator.makeSession(url: authorizeURL, callbackScheme: "twitch") { _ in }

    #expect(session.presentationContextProvider === authenticator)
  }

  @Test("le callback reçu est rendu tel quel")
  func callback() throws {
    let outcome = SystemWebAuthenticator.outcome(callback: callbackURL, error: nil)

    #expect(try outcome.get() == callbackURL)
  }

  @Test("la feuille fermée par la personne devient une annulation")
  func canceledLogin() {
    let outcome = SystemWebAuthenticator.outcome(callback: nil, error: ASWebAuthenticationSessionError(.canceledLogin))

    #expect(throws: WebAuthenticationError.canceled) { try outcome.get() }
  }

  @Test("une autre erreur de la feuille n'est pas une annulation")
  func otherError() {
    let outcome = SystemWebAuthenticator.outcome(
      callback: nil,
      error: ASWebAuthenticationSessionError(.presentationContextInvalid)
    )

    #expect(throws: ASWebAuthenticationSessionError.self) { try outcome.get() }
  }
}
