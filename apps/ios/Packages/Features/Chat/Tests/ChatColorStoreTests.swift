import Chat
import DesignSystem
import Domain
import Testing

private struct RouteDown: Error {}

@MainActor
private final class FakeChatColorUpdater: ChatColorUpdating {
  private(set) var sent: [String?] = []
  var fails = false
  var holds = false
  private var held: CheckedContinuation<Void, Never>?

  func setChatColor(_ hex: String?) async throws {
    sent.append(hex)
    if holds {
      await withCheckedContinuation { held = $0 }
    }
    if fails { throw RouteDown() }
  }

  func waitForHeld() async {
    while held == nil {
      await Task.yield()
    }
  }

  func release() {
    held?.resume()
    held = nil
  }
}

@MainActor
@Suite("Choix de la couleur de pseudo d'un abonné Turbo (plan onboarding-paywall, PR 28)")
struct ChatColorStoreTests {
  @Test("choisir une couleur l'envoie en #RRGGBB par PUT /v1/me/chat-color, puis l'affiche")
  func choose() async {
    let updater = FakeChatColorUpdater()
    let store = ChatColorStore(updater: updater, selected: nil)

    await store.choose(.teal)

    #expect(updater.sent == [ChatNameColor.teal.hex])
    #expect(store.selected == .teal)
    #expect(store.hasFailed == false)
  }

  @Test("revenir au défaut envoie null")
  func backToDefault() async {
    let updater = FakeChatColorUpdater()
    let store = ChatColorStore(updater: updater, selected: .red)

    await store.choose(nil)

    #expect(updater.sent == [nil])
    #expect(store.selected == nil)
  }

  @Test("un échec garde l'ancienne couleur et l'annonce ; le choix suivant efface l'annonce")
  func failureKeepsColor() async {
    let updater = FakeChatColorUpdater()
    updater.fails = true
    let store = ChatColorStore(updater: updater, selected: .blue)

    await store.choose(.green)

    #expect(store.selected == .blue)
    #expect(store.hasFailed)

    updater.fails = false
    await store.choose(.green)
    #expect(store.selected == .green)
    #expect(store.hasFailed == false)
  }

  @Test("choisir la couleur déjà en place n'appelle pas la route")
  func sameColor() async {
    let updater = FakeChatColorUpdater()
    let store = ChatColorStore(updater: updater, selected: .purple)

    await store.choose(.purple)

    #expect(updater.sent.isEmpty)
  }

  @Test("pendant un envoi, un second choix est refusé")
  func oneAtATime() async {
    let updater = FakeChatColorUpdater()
    updater.holds = true
    let store = ChatColorStore(updater: updater, selected: nil)

    let first = Task { await store.choose(.teal) }
    await updater.waitForHeld()
    #expect(store.isSaving)
    await store.choose(.red)
    updater.release()
    await first.value

    #expect(updater.sent == [ChatNameColor.teal.hex])
    #expect(store.selected == .teal)
    #expect(store.isSaving == false)
  }
}
