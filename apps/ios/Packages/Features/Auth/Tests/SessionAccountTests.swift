import Auth
import Domain
import Foundation
import Testing

@MainActor
@Suite("Identifiant du compte connecté", .timeLimit(.minutes(1)))
struct SessionAccountTests {
  @Test("connectée, la session donne l'identifiant du compte chargé")
  func signedIn() async {
    let harness = Harness(tokens: storedTokens)
    let running = await harness.launch()
    defer { running.cancel() }

    _ = await eventually { harness.store.phase == .signedIn(viewer) }

    #expect(harness.store.accountID == viewer.id)
  }

  @Test("un compte enregistré (bio modifiée) remplace le compte chargé")
  func accountSaved() async {
    let harness = Harness(tokens: storedTokens)
    let running = await harness.launch()
    defer { running.cancel() }
    _ = await eventually { harness.store.phase == .signedIn(viewer) }
    let saved = Account(id: viewer.id, name: viewer.name, email: viewer.email, bio: "i love do gaming stream")

    harness.store.accountSaved(saved)

    #expect(harness.store.phase == .signedIn(saved))
  }

  @Test("déconnectée, un compte enregistré ne reconnecte pas la session")
  func accountSavedWhileSignedOut() async {
    let harness = Harness(tokens: nil)
    let running = await harness.launch()
    defer { running.cancel() }

    harness.store.accountSaved(viewer)

    #expect(harness.store.phase == .signedOut)
  }

  @Test("un compte qui ne se charge pas (refresh refusé, réseau) est signalé en échec")
  func accountLoadFailed() async {
    let harness = Harness(tokens: storedTokens, account: .failure(NetworkDown()))
    let running = await harness.launch()
    defer { running.cancel() }

    #expect(await eventually { harness.store.hasAccountLoadFailure })
    #expect(harness.store.phase == .signedIn(nil))
  }

  @Test("un nouvel essai après l'échec charge le compte et efface l'échec")
  func accountReloaded() async {
    let harness = Harness(tokens: storedTokens, account: .failure(NetworkDown()), thenAccount: .success(viewer))
    let running = await harness.launch()
    defer { running.cancel() }
    _ = await eventually { harness.store.hasAccountLoadFailure }

    await harness.store.reloadAccount()

    #expect(harness.store.phase == .signedIn(viewer))
    #expect(!harness.store.hasAccountLoadFailure)
  }

  @Test("un nouvel essai qui échoue encore garde l'échec signalé")
  func accountReloadFailsAgain() async {
    let harness = Harness(tokens: storedTokens, account: .failure(NetworkDown()))
    let running = await harness.launch()
    defer { running.cancel() }
    _ = await eventually { harness.store.hasAccountLoadFailure }

    await harness.store.reloadAccount()

    #expect(harness.store.phase == .signedIn(nil))
    #expect(harness.store.hasAccountLoadFailure)
  }

  @Test("un compte chargé n'est pas signalé en échec et un nouvel essai ne le recharge pas")
  func loadedAccountNotReloaded() async {
    let harness = Harness(tokens: storedTokens, thenAccount: .failure(NetworkDown()))
    let running = await harness.launch()
    defer { running.cancel() }
    _ = await eventually { harness.store.phase == .signedIn(viewer) }

    await harness.store.reloadAccount()

    #expect(harness.store.phase == .signedIn(viewer))
    #expect(!harness.store.hasAccountLoadFailure)
  }

  @Test("une déconnexion efface l'échec de chargement du compte")
  func logOutClearsFailure() async {
    let harness = Harness(tokens: storedTokens, account: .failure(NetworkDown()))
    let running = await harness.launch()
    defer { running.cancel() }
    _ = await eventually { harness.store.hasAccountLoadFailure }

    await harness.store.resolveLogOut(.logOut)

    #expect(await eventually { harness.store.phase == .signedOut })
    #expect(!harness.store.hasAccountLoadFailure)
  }

  @Test("une déconnexion pendant un chargement qui échoue ne signale pas d'échec")
  func signedOutWhileFailing() async {
    let gate = Gate()
    let harness = Harness(tokens: storedTokens, account: .failure(NetworkDown()), accountGate: gate)
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.resolveLogOut(.logOut)
    #expect(await eventually { harness.store.phase == .signedOut })
    await gate.open()
    try? await Task.sleep(for: .milliseconds(50))

    #expect(!harness.store.hasAccountLoadFailure)
  }

  @Test("déconnectée, un nouvel essai ne reconnecte pas la session")
  func reloadWhileSignedOut() async {
    let harness = Harness(tokens: nil)
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.reloadAccount()

    #expect(harness.store.phase == .signedOut)
  }

  @Test("déconnectée, la session n'a pas d'identifiant de compte")
  func signedOut() async {
    let harness = Harness(tokens: nil)
    let running = await harness.launch()
    defer { running.cancel() }

    #expect(harness.store.phase == .signedOut)
    #expect(harness.store.accountID == nil)
  }
}
