import AVFoundation
import Foundation
import Player
import Testing

private let streamURL = URL(string: "http://127.0.0.1:8080/live/jean_dupont/index.m3u8")!

@MainActor
private final class FakeMediaPlayer: MediaPlayer {
  var onEvent: ((MediaPlayerEvent) -> Void)?
  private(set) var calls: [String] = []

  func load(_ url: URL) {
    calls.append("load \(url.absoluteString)")
  }

  func play() {
    calls.append("play")
  }

  func stop() {
    calls.append("stop")
  }

  func render(into _: AVPlayerLayer) {}

  func send(_ event: MediaPlayerEvent) {
    onEvent?(event)
  }
}

@MainActor
private func playing() -> (PlayerController, FakeMediaPlayer) {
  let player = FakeMediaPlayer()
  let controller = PlayerController(player: player)
  controller.load(streamURL)
  player.send(.playing)
  return (controller, player)
}

@MainActor
@Suite("PlayerController : états de lecture contre un faux lecteur")
struct PlayerControllerTests {
  @Test("au départ, rien n'est chargé")
  func idle() {
    #expect(PlayerController(player: FakeMediaPlayer()).state == .idle)
  }

  @Test("charger une URL passe en chargement et lance la lecture")
  func load() {
    let player = FakeMediaPlayer()
    let controller = PlayerController(player: player)

    controller.load(streamURL)

    #expect(controller.state == .loading)
    #expect(player.calls == ["load \(streamURL.absoluteString)", "play"])
  }

  @Test("la lecture qui démarre passe en lecture")
  func startsPlaying() {
    let (controller, _) = playing()

    #expect(controller.state == .playing)
  }

  @Test("une attente pendant la lecture passe en bufferisation, puis la lecture reprend")
  func buffering() {
    let (controller, player) = playing()

    player.send(.waiting)
    #expect(controller.state == .buffering)

    player.send(.playing)
    #expect(controller.state == .playing)
  }

  @Test("une attente pendant le chargement reste un chargement")
  func waitingWhileLoading() {
    let player = FakeMediaPlayer()
    let controller = PlayerController(player: player)
    controller.load(streamURL)

    player.send(.waiting)

    #expect(controller.state == .loading)
  }

  @Test("une erreur de lecture passe en erreur ; réessayer recharge la même URL", arguments: [true, false])
  func failureThenRetry(afterPlaying: Bool) {
    let player = FakeMediaPlayer()
    let controller = PlayerController(player: player)
    controller.load(streamURL)
    if afterPlaying { player.send(.playing) }

    player.send(.failed)
    #expect(controller.state == .failed)

    controller.retry()
    #expect(controller.state == .loading)
    #expect(Array(player.calls.suffix(2)) == ["load \(streamURL.absoluteString)", "play"])
  }

  @Test("réessayer hors erreur ne fait rien")
  func retryWithoutFailure() {
    let (controller, player) = playing()

    controller.retry()

    #expect(controller.state == .playing)
    #expect(player.calls == ["load \(streamURL.absoluteString)", "play"])
  }

  @Test("la fin du live passe en terminé, et y reste")
  func ended() {
    let (controller, player) = playing()

    player.send(.ended)
    player.send(.waiting)
    player.send(.playing)

    #expect(controller.state == .ended)
  }

  @Test("une erreur reste une erreur jusqu'au nouvel essai")
  func failureIsSticky() {
    let (controller, player) = playing()

    player.send(.failed)
    player.send(.playing)

    #expect(controller.state == .failed)
  }

  @Test("arrêter coupe le lecteur et revient au repos ; les événements tardifs sont ignorés")
  func stop() {
    let (controller, player) = playing()

    controller.stop()
    player.send(.playing)
    player.send(.failed)

    #expect(controller.state == .idle)
    #expect(player.calls.last == "stop")
  }

  @Test("une pause en lecture ou en bufferisation passe en pause, et la lecture qui reprend repasse en lecture")
  func pause() {
    let (controller, player) = playing()

    player.send(.paused)
    #expect(controller.state == .paused)

    player.send(.waiting)
    #expect(controller.state == .buffering)
    player.send(.paused)
    #expect(controller.state == .paused)

    player.send(.playing)
    #expect(controller.state == .playing)
  }

  @Test("une pause pendant le chargement reste un chargement")
  func pauseWhileLoading() {
    let player = FakeMediaPlayer()
    let controller = PlayerController(player: player)
    controller.load(streamURL)

    player.send(.paused)

    #expect(controller.state == .loading)
  }

  @Test("reprendre relance le lecteur en pause, et seulement en pause")
  func resume() {
    let (controller, player) = playing()

    controller.resume()
    #expect(player.calls == ["load \(streamURL.absoluteString)", "play"])

    player.send(.paused)
    controller.resume()
    #expect(player.calls == ["load \(streamURL.absoluteString)", "play", "play"])
  }

  @Test("arrêter puis réessayer ne relance rien")
  func retryAfterStop() {
    let (controller, player) = playing()
    player.send(.failed)

    controller.stop()
    controller.retry()

    #expect(controller.state == .idle)
    #expect(player.calls.last == "stop")
  }
}
