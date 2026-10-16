import Auth
import Domain
import Foundation
import Networking
import Testing

@MainActor
@Suite("Session de l'app : connexion, inscription et déconnexion", .timeLimit(.minutes(1)))
struct SessionStoreTests {
  @Test("au lancement sans tokens, l'app est déconnectée")
  func launchSignedOut() async {
    let harness = Harness(tokens: nil)
    let running = await harness.launch()
    defer { running.cancel() }

    #expect(harness.store.phase == .signedOut)
  }

  @Test("au lancement avec des tokens, l'app est connectée et charge le compte de GET /v1/me")
  func launchSignedIn() async {
    let harness = Harness(tokens: storedTokens)
    let running = await harness.launch()
    defer { running.cancel() }

    #expect(await eventually { harness.store.phase == .signedIn(viewer) })
  }

  @Test("Log In ouvre l'autorisation sans prompt, avec le schéma de callback twitch")
  func logInOpensAuthorization() async throws {
    let harness = Harness(reply: canceled)
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.signIn(.signIn)

    let request = try #require(harness.authenticator.requests.first)
    #expect(request.callbackScheme == "twitch")
    #expect(request.url.absoluteString.hasPrefix("http://127.0.0.1:3000/auth/oauth2/authorize?"))
    #expect(query(of: request.url)["prompt"] == nil)
  }

  @Test("Sign Up ouvre l'autorisation avec prompt=create")
  func signUpOpensRegistration() async throws {
    let harness = Harness(reply: canceled)
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.signIn(.signUp)

    let request = try #require(harness.authenticator.requests.first)
    #expect(query(of: request.url)["prompt"] == "create")
  }

  @Test("la feuille annulée laisse l'app déconnectée, sans erreur ni échange de code")
  func canceledSheet() async {
    let harness = Harness(reply: canceled)
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.signIn(.signIn)

    #expect(harness.store.phase == .signedOut)
    #expect(harness.store.hasSignInFailure == false)
    #expect(await harness.tokenCalls().isEmpty)
  }

  @Test("un callback valide échange le code avec le verifier de la tentative, puis connecte et charge le compte")
  func validCallback() async throws {
    let harness = Harness(reply: approved)
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.signIn(.signIn)

    let opened = try #require(harness.authenticator.requests.first)
    let exchange = try #require(await harness.tokenCalls().first)
    let verifier = try #require(form(of: exchange)["code_verifier"])
    #expect(form(of: exchange)["code"] == "code-1")
    #expect(challenge(of: verifier) == query(of: opened.url)["code_challenge"])
    #expect(harness.tokens.tokens == storedTokens)
    #expect(harness.store.phase == .signedIn(viewer))
    #expect(harness.store.hasSignInFailure == false)
  }

  @Test("un callback au state différent laisse l'app déconnectée et signale l'échec, sans échange de code")
  func stateMismatch() async {
    let harness = Harness(reply: { _ in callback(["code": "code-1", "state": "forged"]) })
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.signIn(.signIn)

    #expect(harness.store.phase == .signedOut)
    #expect(harness.store.hasSignInFailure)
    #expect(await harness.tokenCalls().isEmpty)
  }

  @Test("une erreur renvoyée par le serveur dans le callback laisse l'app déconnectée et signale l'échec")
  func serverError() async {
    let harness = Harness(reply: { url in callback(["error": "access_denied", "state": query(of: url)["state"] ?? ""]) })
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.signIn(.signIn)

    #expect(harness.store.phase == .signedOut)
    #expect(harness.store.hasSignInFailure)
  }

  @Test("un échange de code refusé laisse l'app déconnectée et signale l'échec")
  func exchangeRejected() async {
    let harness = Harness(reply: approved)
    await harness.transport.respond(status: 400, json: invalidGrantJSON)
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.signIn(.signIn)

    #expect(harness.store.phase == .signedOut)
    #expect(harness.store.hasSignInFailure)
  }

  @Test("l'alerte d'échec se referme")
  func dismissFailure() async throws {
    let harness = Harness(reply: { _ in callback(["code": "code-1", "state": "forged"]) })
    let running = await harness.launch()
    defer { running.cancel() }
    await harness.store.signIn(.signIn)
    try #require(harness.store.hasSignInFailure)

    harness.store.dismissSignInFailure()

    #expect(harness.store.hasSignInFailure == false)
  }

  @Test("pendant que la feuille est ouverte, l'app est en connexion et un second appui n'en ouvre pas une autre")
  func signingIn() async {
    let gate = Gate()
    let harness = Harness(reply: { url in
      await gate.wait()
      return try await approved(url)
    })
    let running = await harness.launch()
    defer { running.cancel() }

    let first = Task { await harness.store.signIn(.signIn) }
    #expect(await eventually { harness.store.phase == .signingIn })
    let second = Task { await harness.store.signIn(.signUp) }
    await gate.open()
    await first.value
    await second.value

    #expect(harness.authenticator.requests.count == 1)
    #expect(harness.store.phase == .signedIn(viewer))
  }

  @Test("Log Out confirmé révoque le refresh token, vide le Keychain et revient à l'accueil")
  func logOutConfirmed() async throws {
    let harness = Harness(tokens: storedTokens)
    let running = await harness.launch()
    defer { running.cancel() }
    _ = await eventually { harness.store.phase == .signedIn(viewer) }

    await harness.store.resolveLogOut(.logOut)

    let revocation = try #require(await harness.revokeCalls().first)
    #expect(form(of: revocation)["token"] == "refresh-1")
    #expect(harness.tokens.tokens == nil)
    #expect(await eventually { harness.store.phase == .signedOut })
  }

  @Test("Cancel ne révoque rien et laisse l'app connectée")
  func logOutCanceled() async {
    let harness = Harness(tokens: storedTokens)
    let running = await harness.launch()
    defer { running.cancel() }
    _ = await eventually { harness.store.phase == .signedIn(viewer) }

    await harness.store.resolveLogOut(.cancel)

    #expect(await harness.revokeCalls().isEmpty)
    #expect(harness.tokens.tokens == storedTokens)
    #expect(harness.store.phase == .signedIn(viewer))
  }

  @Test("un Log Out qui ne vide pas le Keychain laisse l'app connectée et signale l'échec")
  func logOutFailed() async {
    let harness = Harness(tokens: storedTokens, clearFails: true)
    let running = await harness.launch()
    defer { running.cancel() }
    _ = await eventually { harness.store.phase == .signedIn(viewer) }

    await harness.store.resolveLogOut(.logOut)

    #expect(harness.store.hasLogOutFailure)
    #expect(harness.store.phase == .signedIn(viewer))
  }

  @Test("l'alerte d'échec du Log Out se referme")
  func dismissLogOutFailure() async throws {
    let harness = Harness(tokens: storedTokens, clearFails: true)
    let running = await harness.launch()
    defer { running.cancel() }
    _ = await eventually { harness.store.phase == .signedIn(viewer) }
    await harness.store.resolveLogOut(.logOut)
    try #require(harness.store.hasLogOutFailure)

    harness.store.dismissLogOutFailure()

    #expect(harness.store.hasLogOutFailure == false)
  }

  @Test("un Log Out réussi ne signale pas d'échec")
  func logOutSucceededWithoutFailure() async {
    let harness = Harness(tokens: storedTokens)
    let running = await harness.launch()
    defer { running.cancel() }
    _ = await eventually { harness.store.phase == .signedIn(viewer) }

    await harness.store.resolveLogOut(.logOut)

    #expect(harness.store.hasLogOutFailure == false)
  }

  @Test("la session qui publie .signedOut (invalid_grant au refresh) ramène l'app à l'accueil")
  func sessionSignedOut() async {
    let harness = Harness(tokens: storedTokens)
    let running = await harness.launch()
    defer { running.cancel() }
    _ = await eventually { harness.store.phase == .signedIn(viewer) }
    await harness.transport.respond(status: 400, json: invalidGrantJSON)

    _ = try? await harness.session.accessTokenRejected("access-1", at: now)

    #expect(await eventually { harness.store.phase == .signedOut })
  }

  @Test("un second 401 de GET /v1/me vide la session et ramène l'app à l'accueil")
  func accountRejected() async {
    let harness = Harness(tokens: storedTokens, account: .failure(SessionError.signedOut))
    let running = await harness.launch()
    defer { running.cancel() }

    #expect(await eventually { harness.store.phase == .signedOut })
    #expect(harness.tokens.tokens == nil)
    #expect(await harness.revokeCalls().count == 1)
  }

  @Test("une déconnexion pendant le chargement du compte n'est pas annulée par sa réponse")
  func signedOutWhileLoading() async {
    let gate = Gate()
    let harness = Harness(tokens: storedTokens, accountGate: gate)
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.resolveLogOut(.logOut)
    #expect(await eventually { harness.store.phase == .signedOut })
    await gate.open()
    try? await Task.sleep(for: .milliseconds(50))

    #expect(harness.store.phase == .signedOut)
  }

  @Test("un compte qui ne se charge pas (réseau) laisse l'app connectée, sans compte")
  func accountUnavailable() async {
    let harness = Harness(tokens: storedTokens, account: .failure(NetworkDown()))
    let running = await harness.launch()
    defer { running.cancel() }

    #expect(await eventually { harness.store.phase == .signedIn(nil) })
    #expect(harness.tokens.tokens == storedTokens)
  }
}
