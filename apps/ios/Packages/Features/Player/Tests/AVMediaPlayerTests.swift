import AVFoundation
import Foundation
import Player
import Testing

@Suite("AVMediaPlayer : signaux d'AVPlayer traduits en événements")
struct AVMediaPlayerEventTests {
  @Test(
    "timeControlStatus",
    arguments: [
      (AVPlayer.TimeControlStatus.playing, MediaPlayerEvent?.some(.playing)),
      (.waitingToPlayAtSpecifiedRate, .some(.waiting)),
      (.paused, nil),
    ]
  )
  func timeControlStatus(status: AVPlayer.TimeControlStatus, expected: MediaPlayerEvent?) {
    #expect(MediaPlayerEvent(status) == expected)
  }

  @Test(
    "statut de l'item",
    arguments: [
      (AVPlayerItem.Status.failed, MediaPlayerEvent?.some(.failed)),
      (.readyToPlay, nil),
      (.unknown, nil),
    ]
  )
  func itemStatus(status: AVPlayerItem.Status, expected: MediaPlayerEvent?) {
    #expect(MediaPlayerEvent(status) == expected)
  }
}

@MainActor
@Suite("AVMediaPlayer sur un vrai AVPlayer")
struct AVMediaPlayerTests {
  @Test("une URL illisible remonte une erreur sur le main actor", .timeLimit(.minutes(1)))
  func unreadableURL() async {
    let player = AVMediaPlayer()

    let event = await withCheckedContinuation { continuation in
      player.onEvent = { event in
        MainActor.assertIsolated()
        guard event == .failed else { return }
        player.onEvent = nil
        continuation.resume(returning: event)
      }
      player.load(URL(fileURLWithPath: "/nonexistent/index.m3u8"))
      player.play()
    }

    #expect(event == .failed)
  }

  @Test("rend le même lecteur dans chaque surface")
  func rendersIntoLayers() {
    let player = AVMediaPlayer()
    let first = AVPlayerLayer()
    let second = AVPlayerLayer()

    player.render(into: first)
    player.render(into: second)

    #expect(first.player != nil)
    #expect(first.player === second.player)
  }

  @Test("arrêter retire l'item en cours")
  func stopClearsItem() {
    let player = AVMediaPlayer()
    let layer = AVPlayerLayer()
    player.render(into: layer)
    player.load(URL(fileURLWithPath: "/nonexistent/index.m3u8"))
    #expect(layer.player?.currentItem != nil)

    player.stop()

    #expect(layer.player?.currentItem == nil)
  }
}
