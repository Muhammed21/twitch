import Navigation
import Testing

@MainActor
private final class MemoryModeStorage: AppModeStorage {
  private(set) var saved: [AppMode] = []
  private let initial: AppMode?

  init(_ initial: AppMode? = nil) {
    self.initial = initial
  }

  func load() -> AppMode? {
    initial
  }

  func save(_ mode: AppMode) {
    saved.append(mode)
  }
}

@MainActor
private func makeSwitch(_ initial: AppMode? = nil) -> (CreatorMode, MemoryModeStorage) {
  let storage = MemoryModeStorage(initial)
  return (CreatorMode(storage: storage, hold: .zero), storage)
}

@MainActor
@Suite("Passage entre le mode spectateur et le tableau de bord des créateurs (IMG_9611, IMG_9623, IMG_9627, IMG_9630)")
struct CreatorModeTests {
  @Test("au premier lancement, l'app s'ouvre en mode spectateur")
  func startsAsViewer() {
    let (mode, _) = makeSwitch()

    #expect(mode.mode == .viewer)
    #expect(mode.transition == nil)
    #expect(!mode.isShowingActions)
  }

  @Test("l'app rouvre le mode enregistré au lancement précédent")
  func restoresSavedMode() {
    let (mode, _) = makeSwitch(.creator)

    #expect(mode.mode == .creator)
  }

  @Test("le bouton « + » ouvre la feuille d'actions, Annuler la referme")
  func actionsSheet() {
    let (mode, _) = makeSwitch()

    mode.showActions()
    #expect(mode.isShowingActions)

    mode.dismissActions()
    #expect(!mode.isShowingActions)
  }

  @Test("la troisième ligne de la feuille ouvre le tableau de bord en mode spectateur, et le quitte en mode créateur")
  func switchRowFollowsMode() {
    #expect(makeSwitch(.viewer).0.switchAction == .enterDashboard)
    #expect(makeSwitch(.creator).0.switchAction == .leaveDashboard)
  }

  @Test("toucher « Tableau de bord des créateurs » ferme la feuille, montre le passage, puis enregistre le mode créateur")
  func entersDashboard() async {
    let (mode, storage) = makeSwitch()
    mode.showActions()

    let switching = Task { await mode.switchMode() }
    await Task.yield()
    #expect(!mode.isShowingActions)
    await switching.value

    #expect(mode.mode == .creator)
    #expect(mode.transition == nil)
    #expect(storage.saved == [.creator])
  }

  @Test("pendant le passage, l'écran annonce le mode visé")
  func transitionNamesTarget() async {
    let storage = MemoryModeStorage(.creator)
    let gate = AsyncStream<Void>.makeStream()
    let mode = CreatorMode(storage: storage, hold: .zero) { _ in
      for await _ in gate.stream {
        return
      }
    }

    let switching = Task { await mode.switchMode() }
    while mode.transition == nil {
      await Task.yield()
    }
    #expect(mode.transition == .viewer)
    #expect(mode.mode == .creator)

    gate.continuation.yield()
    await switching.value
    #expect(mode.mode == .viewer)
    #expect(storage.saved == [.viewer])
  }

  @Test("un second toucher pendant le passage ne relance pas de bascule")
  func ignoresSwitchDuringTransition() async {
    let gate = AsyncStream<Void>.makeStream()
    let storage = MemoryModeStorage()
    let mode = CreatorMode(storage: storage, hold: .zero) { _ in
      for await _ in gate.stream {
        return
      }
    }

    let first = Task { await mode.switchMode() }
    while mode.transition == nil {
      await Task.yield()
    }
    await mode.switchMode()
    gate.continuation.yield()
    await first.value

    #expect(mode.mode == .creator)
    #expect(storage.saved == [.creator])
  }

  @Test("la déconnexion ramène le mode spectateur et l'enregistre")
  func resetReturnsToViewer() {
    let (mode, storage) = makeSwitch(.creator)
    mode.showActions()

    mode.reset()

    #expect(mode.mode == .viewer)
    #expect(!mode.isShowingActions)
    #expect(storage.saved == [.viewer])
  }
}
