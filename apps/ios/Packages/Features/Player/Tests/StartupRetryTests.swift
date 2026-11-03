import Foundation
import Player
import Testing

private let liveURL = URL(string: "http://127.0.0.1:3002/hls/channels/7c1d9e2a-4b3f-4a5e-8d6c-2f1e0a9b8c7d/master.m3u8")!
private let otherURL = URL(string: "http://127.0.0.1:3002/hls/channels/1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d/master.m3u8")!

@MainActor
private func retrying(_ player: FakeMediaPlayer, on scheduler: ManualScheduler, attempts: Int) -> PlayerController {
  PlayerController(player: player, startupRetry: StartupRetry(attempts: attempts) { scheduler.schedule($0) })
}

@MainActor
@Suite("PlayerController : relance au démarrage d'un live, avant son premier segment")
struct StartupRetryTests {
  @Test("une erreur au chargement reste un chargement et relance la même URL au tour prévu")
  func retriesWhileLoading() {
    let player = FakeMediaPlayer()
    let scheduler = ManualScheduler()
    let controller = retrying(player, on: scheduler, attempts: 3)
    controller.load(liveURL)

    player.send(.failed)

    #expect(controller.state == .loading)
    #expect(player.calls == ["load \(liveURL.absoluteString)", "play"])
    scheduler.runPending()
    #expect(controller.state == .loading)
    #expect(player.calls == ["load \(liveURL.absoluteString)", "play", "load \(liveURL.absoluteString)", "play"])
  }

  @Test("une fois les relances épuisées, l'erreur passe en erreur")
  func givesUp() {
    let player = FakeMediaPlayer()
    let scheduler = ManualScheduler()
    let controller = retrying(player, on: scheduler, attempts: 2)
    controller.load(liveURL)

    player.send(.failed)
    scheduler.runPending()
    player.send(.failed)
    scheduler.runPending()
    player.send(.failed)

    #expect(controller.state == .failed)
    #expect(scheduler.pending.isEmpty)
    #expect(player.calls.count(where: { $0.hasPrefix("load") }) == 3)
  }

  @Test("une erreur après le début de la lecture passe en erreur, sans relance")
  func noRetryOncePlaying() {
    let player = FakeMediaPlayer()
    let scheduler = ManualScheduler()
    let controller = retrying(player, on: scheduler, attempts: 3)
    controller.load(liveURL)
    player.send(.playing)

    player.send(.failed)

    #expect(controller.state == .failed)
    #expect(scheduler.pending.isEmpty)
  }

  @Test("arrêter annule la relance prévue")
  func stopCancelsRetry() {
    let player = FakeMediaPlayer()
    let scheduler = ManualScheduler()
    let controller = retrying(player, on: scheduler, attempts: 3)
    controller.load(liveURL)
    player.send(.failed)

    controller.stop()
    scheduler.runPending()

    #expect(controller.state == .idle)
    #expect(player.calls.last == "stop")
  }

  @Test("un nouveau chargement rend caduque la relance de l'URL précédente")
  func newLoadSupersedesRetry() {
    let player = FakeMediaPlayer()
    let scheduler = ManualScheduler()
    let controller = retrying(player, on: scheduler, attempts: 3)
    controller.load(liveURL)
    player.send(.failed)

    controller.load(otherURL)
    scheduler.runPending()

    #expect(player.calls.last(where: { $0.hasPrefix("load") }) == "load \(otherURL.absoluteString)")
    #expect(player.calls.count(where: { $0.hasPrefix("load") }) == 2)
  }

  @Test("un nouveau chargement remet les relances à zéro")
  func newLoadResetsAttempts() {
    let player = FakeMediaPlayer()
    let scheduler = ManualScheduler()
    let controller = retrying(player, on: scheduler, attempts: 1)
    controller.load(liveURL)
    player.send(.failed)
    scheduler.runPending()
    player.send(.failed)
    #expect(controller.state == .failed)

    controller.load(otherURL)
    player.send(.failed)

    #expect(controller.state == .loading)
    #expect(scheduler.pending.count == 1)
  }

  @Test("la relance périodique recharge l'URL une fois le délai écoulé")
  func periodicRetry() async throws {
    let player = FakeMediaPlayer()
    let controller = PlayerController(player: player, startupRetry: .every(.milliseconds(10), attempts: 1))
    controller.load(liveURL)

    player.send(.failed)

    let deadline = ContinuousClock.now + .seconds(2)
    while player.calls.count < 4, ContinuousClock.now < deadline {
      try await Task.sleep(for: .milliseconds(5))
    }
    #expect(player.calls == ["load \(liveURL.absoluteString)", "play", "load \(liveURL.absoluteString)", "play"])
  }

  @Test("la relance périodique attend son délai avant de recharger")
  func periodicRetryWaits() async throws {
    let player = FakeMediaPlayer()
    let controller = PlayerController(player: player, startupRetry: .every(.seconds(60), attempts: 1))
    controller.load(liveURL)

    player.send(.failed)
    try await Task.sleep(for: .milliseconds(50))

    #expect(controller.state == .loading)
    #expect(player.calls == ["load \(liveURL.absoluteString)", "play"])
    controller.stop()
  }

  @Test("sans relance, une erreur au chargement passe en erreur")
  func noneRetries() {
    let player = FakeMediaPlayer()
    let controller = PlayerController(player: player, startupRetry: .none)
    controller.load(liveURL)

    player.send(.failed)

    #expect(controller.state == .failed)
  }
}
