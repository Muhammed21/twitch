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

  @Test("déconnectée, la session n'a pas d'identifiant de compte")
  func signedOut() async {
    let harness = Harness(tokens: nil)
    let running = await harness.launch()
    defer { running.cancel() }

    #expect(harness.store.phase == .signedOut)
    #expect(harness.store.accountID == nil)
  }
}
