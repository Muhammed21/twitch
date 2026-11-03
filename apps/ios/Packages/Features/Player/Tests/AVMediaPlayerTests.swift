import AVFoundation
import Foundation
@testable import Player
import Testing

@Suite("AVMediaPlayer : signaux d'AVPlayer traduits en événements")
struct AVMediaPlayerEventTests {
  @Test(
    "timeControlStatus",
    arguments: [
      (AVPlayer.TimeControlStatus.playing, MediaPlayerEvent?.some(.playing)),
      (.waitingToPlayAtSpecifiedRate, .some(.waiting)),
      (.paused, .some(.paused)),
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

  @Test("ignore un événement de l'item précédent, transmet celui de l'item courant")
  func ignoresStaleItem() throws {
    let player = AVMediaPlayer()
    var events: [MediaPlayerEvent] = []
    player.onEvent = { events.append($0) }
    player.load(URL(fileURLWithPath: "/nonexistent/a.m3u8"))
    let previous = try #require(player.currentItemID)
    player.load(URL(fileURLWithPath: "/nonexistent/b.m3u8"))
    let current = try #require(player.currentItemID)

    player.deliver(.failed, from: previous)
    player.deliver(.ended, from: current)

    #expect(events == [.ended])
  }

  @Test("après l'arrêt, plus aucun événement d'item n'est transmis")
  func ignoresItemAfterStop() throws {
    let player = AVMediaPlayer()
    var events: [MediaPlayerEvent] = []
    player.onEvent = { events.append($0) }
    player.load(URL(fileURLWithPath: "/nonexistent/a.m3u8"))
    let item = try #require(player.currentItemID)

    player.stop()
    player.deliver(.failed, from: item)

    #expect(events.isEmpty)
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
