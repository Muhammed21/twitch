import AnalyticsTesting
import Auth
import Domain
import Foundation
import Networking
import Testing

@MainActor
@Suite("Analytics de la session : identify à la connexion, reset au logout (ADR 0012, §2)", .timeLimit(.minutes(1)))
struct SessionAnalyticsTests {
  @Test("Log In identifie le compte chargé puis capture account:signed_in")
  func signedIn() async {
    let harness = Harness(reply: approved)
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.signIn(.signIn)

    #expect(harness.analytics.calls == [.identify(viewer.id), .capture(.accountSignedIn)])
  }

  @Test("Sign Up identifie le compte créé puis capture account:signed_up")
  func signedUp() async {
    let harness = Harness(reply: approved)
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.signIn(.signUp)

    #expect(harness.analytics.calls == [.identify(viewer.id), .capture(.accountSignedUp)])
  }

  @Test("une connexion dont le compte ne se charge pas capture account:signed_in sans identifier")
  func signedInWithoutAccount() async {
    let harness = Harness(reply: approved, account: .failure(URLError(.notConnectedToInternet)))
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.signIn(.signIn)

    #expect(harness.analytics.calls == [.capture(.accountSignedIn)])
  }

  @Test("une feuille annulée n'émet rien")
  func canceledSignIn() async {
    let harness = Harness(reply: canceled)
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.signIn(.signIn)

    #expect(harness.analytics.calls.isEmpty)
  }

  @Test("une autorisation refusée n'émet rien")
  func deniedSignIn() async {
    let harness = Harness(reply: { url in callback(["error": "access_denied", "state": query(of: url)["state"] ?? ""]) })
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.signIn(.signIn)

    #expect(harness.analytics.calls.isEmpty)
  }

  @Test("au lancement avec des tokens, la session demande identify() pour le compte chargé, sans événement")
  func launchSignedIn() async {
    let harness = Harness(tokens: storedTokens)
    let running = await harness.launch()
    defer { running.cancel() }

    #expect(await eventually { harness.analytics.calls == [.identify(viewer.id)] })
  }

  @Test("Log Out confirmé capture account:signed_out puis reset(), dans cet ordre")
  func loggedOut() async {
    let harness = Harness(tokens: storedTokens)
    let running = await harness.launch()
    defer { running.cancel() }
    _ = await eventually { harness.store.phase == .signedIn(viewer) }

    await harness.store.resolveLogOut(.logOut)

    #expect(await eventually {
      harness.analytics.calls == [.identify(viewer.id), .capture(.accountSignedOut), .reset]
    })
  }

  @Test("un Log Out qui échoue n'émet ni account:signed_out ni reset()")
  func logOutFailed() async {
    let harness = Harness(tokens: storedTokens, clearFails: true)
    let running = await harness.launch()
    defer { running.cancel() }
    _ = await eventually { harness.store.phase == .signedIn(viewer) }

    await harness.store.resolveLogOut(.logOut)

    #expect(harness.analytics.calls == [.identify(viewer.id)])
  }

  @Test("une session expirée (invalid_grant) fait reset() sans account:signed_out")
  func sessionExpired() async {
    let harness = Harness(tokens: storedTokens)
    let running = await harness.launch()
    defer { running.cancel() }
    _ = await eventually { harness.store.phase == .signedIn(viewer) }
    await harness.transport.respond(status: 400, json: invalidGrantJSON)

    _ = try? await harness.session.accessTokenRejected("access-1", at: now)

    #expect(await eventually { harness.analytics.calls == [.identify(viewer.id), .reset] })
  }
}
