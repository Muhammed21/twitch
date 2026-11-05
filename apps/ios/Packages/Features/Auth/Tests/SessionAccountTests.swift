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

  @Test("déconnectée, la session n'a pas d'identifiant de compte")
  func signedOut() async {
    let harness = Harness(tokens: nil)
    let running = await harness.launch()
    defer { running.cancel() }

    #expect(harness.store.phase == .signedOut)
    #expect(harness.store.accountID == nil)
  }
}
