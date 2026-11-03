import Domain
import Foundation
import Player
import Testing

private func jeanDupont() throws -> ChannelSlug {
  try ChannelSlug("jean_dupont")
}

private let channelID = ChannelID(UUID(uuidString: "0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d")!)
private let liveURL = URL(string: "http://127.0.0.1:3002/hls/channels/7c1d9e2a-4b3f-4a5e-8d6c-2f1e0a9b8c7d/master.m3u8")!
private let previousURL = URL(string: "http://127.0.0.1:3002/hls/channels/1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d/master.m3u8")!

private struct Unreachable: Error {}

private struct FakeChannels: ChannelRepository {
  var cancelsCaller = false
  var fails = false

  func channel(withSlug slug: ChannelSlug) async throws -> Channel {
    if cancelsCaller { withUnsafeCurrentTask { $0?.cancel() } }
    if fails { throw Unreachable() }
    return Channel(id: channelID, slug: slug, title: "Speedrun", ownerID: UUID())
  }
}

private actor FakePlayback: PlaybackSource {
  private let url: URL?
  private let fails: Bool
  private(set) var requested: [ChannelID] = []

  init(url: URL?, fails: Bool = false) {
    self.url = url
    self.fails = fails
  }

  func playbackURL(for channel: ChannelID) async throws -> URL? {
    requested.append(channel)
    if fails { throw Unreachable() }
    return url
  }
}

@MainActor
private struct ChannelScreen {
  let playback: ChannelPlayback
  let controller: PlayerController
  let player: FakeMediaPlayer

  init(channels: FakeChannels = FakeChannels(), playback source: FakePlayback) {
    player = FakeMediaPlayer()
    controller = PlayerController(player: player)
    playback = ChannelPlayback(channels: channels, playback: source, controller: controller)
  }
}

private struct TimedOut: Error {}

@MainActor
private func waitUntil(_ condition: () -> Bool) async throws {
  let deadline = ContinuousClock.now + .seconds(2)
  while !condition() {
    guard ContinuousClock.now < deadline else { throw TimedOut() }
    try await Task.sleep(for: .milliseconds(5))
  }
}

@MainActor
@Suite("ChannelPlayback : lecture du live à l'ouverture de l'écran de chaîne")
struct ChannelPlaybackTests {
  @Test("une chaîne en live charge l'URL de lecture de son identifiant, jusqu'à ce que l'écran parte")
  func live() async throws {
    let source = FakePlayback(url: liveURL)
    let screen = ChannelScreen(playback: source)
    let slug = try jeanDupont()

    let opening = Task { await screen.playback.open(slug) }
    try await waitUntil { screen.player.calls.count == 2 }

    #expect(await source.requested == [channelID])
    #expect(screen.controller.state == .loading)
    #expect(screen.player.calls == ["load \(liveURL.absoluteString)", "play"])
    opening.cancel()
    await opening.value
    #expect(screen.controller.state == .idle)
    #expect(screen.player.calls.last == "stop")
  }

  @Test("l'écran d'une autre chaîne ouvert entre-temps garde son live quand le précédent part")
  func newerScreenKeepsPlaying() async throws {
    let screen = ChannelScreen(playback: FakePlayback(url: liveURL))
    let slug = try jeanDupont()
    let previous = Task { await screen.playback.open(slug) }
    try await waitUntil { screen.player.calls.count == 2 }

    let next = Task { await screen.playback.open(slug) }
    try await waitUntil { screen.player.calls.count == 4 }
    previous.cancel()
    await previous.value

    #expect(screen.controller.state == .loading)
    #expect(!screen.player.calls.contains("stop"))
    next.cancel()
    await next.value
  }

  @Test("une chaîne hors live arrête le live d'avant et laisse le player au repos")
  func offline() async throws {
    let screen = ChannelScreen(playback: FakePlayback(url: nil))
    screen.controller.load(previousURL)

    try await screen.playback.open(jeanDupont())

    #expect(screen.controller.state == .idle)
    #expect(screen.player.calls.last == "stop")
  }

  @Test(
    "une chaîne ou une URL de lecture injoignable laisse le player au repos",
    arguments: [(true, false), (false, true)]
  )
  func unreachable(channelFails: Bool, playbackFails: Bool) async throws {
    let screen = ChannelScreen(
      channels: FakeChannels(fails: channelFails),
      playback: FakePlayback(url: liveURL, fails: playbackFails)
    )
    screen.controller.load(previousURL)

    try await screen.playback.open(jeanDupont())

    #expect(screen.controller.state == .idle)
    #expect(screen.player.calls.last == "stop")
  }

  @Test("un écran quitté pendant la demande ne charge rien")
  func cancelled() async throws {
    let screen = ChannelScreen(
      channels: FakeChannels(cancelsCaller: true),
      playback: FakePlayback(url: liveURL)
    )
    let slug = try jeanDupont()

    let opening = Task { await screen.playback.open(slug) }
    await opening.value

    #expect(screen.controller.state == .idle)
    #expect(screen.player.calls.isEmpty)
  }
}
