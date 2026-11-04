import Channel
import Domain
import Foundation
import Testing

private let channelID = ChannelID(UUID(uuidString: "7a1c3e5f-2b4d-4c6e-8f10-3a5b7c9d1e2f")!)

private func jeanDupont() throws -> ChannelSlug {
  try ChannelSlug("jean_dupont")
}

private func viewers(_ count: Int) throws -> LiveStatus {
  try .live(viewers: ViewerCount(count))
}

private struct Unreachable: Error {}

private actor FakeChannels: ChannelRepository {
  private var failures: Int
  private(set) var lookups = 0

  init(failures: Int = 0) {
    self.failures = failures
  }

  func channel(withSlug slug: ChannelSlug) throws -> Channel {
    lookups += 1
    guard failures == 0 else {
      failures -= 1
      throw Unreachable()
    }
    return Channel(id: channelID, slug: slug, title: "Speedrun", ownerID: UUID())
  }
}

private actor FakeReporter: PresenceReporter {
  private var failures: [any Error]
  private(set) var reports: [ChannelID] = []

  init(failures: [any Error] = []) {
    self.failures = failures
  }

  func reportPresence(in channel: ChannelID) throws {
    reports.append(channel)
    guard failures.isEmpty else { throw failures.removeFirst() }
  }
}

private actor HeartbeatClock {
  private var sleepers: [CheckedContinuation<Void, Never>] = []
  private(set) var waited: [Duration] = []

  func wait(_ duration: Duration) async {
    waited.append(duration)
    await withCheckedContinuation { sleepers.append($0) }
  }

  var pending: Int {
    sleepers.count
  }

  func isWaiting(beat: Int) -> Bool {
    waited.count == beat && sleepers.count == 1
  }

  func tick() {
    let due = sleepers
    sleepers = []
    due.forEach { $0.resume() }
  }
}

@MainActor
private func waitUntil(_ condition: @MainActor () async -> Bool) async throws {
  while await !condition() {
    try await Task.sleep(for: .milliseconds(5))
  }
}

@MainActor
private func makePresence(
  reporter: FakeReporter,
  channels: FakeChannels = FakeChannels(),
  clock: HeartbeatClock
) -> ChannelPresence {
  ChannelPresence(channels: channels, reporter: reporter, wait: { await clock.wait($0) })
}

@MainActor
private func watching(_ status: LiveStatus?, isForeground: Bool = true) throws -> ChannelPresence.Watching {
  try ChannelPresence.Watching(slug: jeanDupont(), status: status, isForeground: isForeground)
}

@MainActor
@Suite("ChannelPresence : présence du viewer tant que le lecteur d'un live est affiché", .timeLimit(.minutes(1)))
struct ChannelPresenceTests {
  @Test("signale la présence dès l'ouverture, puis toutes les 20 secondes, sans résoudre la chaîne à nouveau")
  func reportsEveryInterval() async throws {
    let reporter = FakeReporter()
    let channels = FakeChannels()
    let clock = HeartbeatClock()
    let presence = makePresence(reporter: reporter, channels: channels, clock: clock)
    let live = try watching(viewers(3))

    let running = Task { await presence.run(live) }
    try await waitUntil { await clock.pending == 1 }
    #expect(await reporter.reports == [channelID])
    await clock.tick()
    try await waitUntil { await reporter.reports.count == 2 }
    try await waitUntil { await clock.pending == 1 }
    running.cancel()
    await clock.tick()
    await running.value

    #expect(await reporter.reports == [channelID, channelID])
    #expect(await clock.waited == [.seconds(20), .seconds(20)])
    #expect(await channels.lookups == 1)
  }

  @Test("ne signale rien hors live, avant le statut, ou app en arrière-plan")
  func silentWhenNotWatchingLive() async throws {
    let cases: [ChannelPresence.Watching] = try [
      watching(.offline),
      watching(nil),
      watching(viewers(3), isForeground: false),
    ]

    for watched in cases {
      let reporter = FakeReporter()
      let channels = FakeChannels()
      let clock = HeartbeatClock()

      await makePresence(reporter: reporter, channels: channels, clock: clock).run(watched)

      #expect(await reporter.reports.isEmpty)
      #expect(await channels.lookups == 0)
      #expect(await clock.waited.isEmpty)
    }
  }

  @Test("un refus ou une limite de débit attend le battement suivant, sans relance immédiate")
  func failureKeepsCadence() async throws {
    let reporter = FakeReporter(failures: [
      ServiceProblem(type: "about:blank", title: "Trop de requêtes", status: 429, detail: nil),
      Unreachable(),
    ])
    let clock = HeartbeatClock()
    let presence = makePresence(reporter: reporter, clock: clock)
    let live = try watching(viewers(3))

    let running = Task { await presence.run(live) }
    try await waitUntil { await clock.pending == 1 }
    #expect(await reporter.reports.count == 1)
    await clock.tick()
    try await waitUntil { await clock.isWaiting(beat: 2) }
    #expect(await reporter.reports.count == 2)
    await clock.tick()
    try await waitUntil { await clock.isWaiting(beat: 3) }
    running.cancel()
    await clock.tick()
    await running.value

    #expect(await reporter.reports.count == 3)
    #expect(await clock.waited == [.seconds(20), .seconds(20), .seconds(20)])
  }

  @Test("une chaîne introuvable est cherchée de nouveau au battement suivant")
  func lookupFailureRetriesNextBeat() async throws {
    let reporter = FakeReporter()
    let channels = FakeChannels(failures: 1)
    let clock = HeartbeatClock()
    let presence = makePresence(reporter: reporter, channels: channels, clock: clock)
    let live = try watching(viewers(3))

    let running = Task { await presence.run(live) }
    try await waitUntil { await clock.pending == 1 }
    #expect(await reporter.reports.isEmpty)
    await clock.tick()
    try await waitUntil { await clock.isWaiting(beat: 2) }
    running.cancel()
    await clock.tick()
    await running.value

    #expect(await reporter.reports == [channelID])
    #expect(await channels.lookups == 2)
  }

  @Test("s'arrête quand le lecteur se ferme, sans signal de plus")
  func stopsWhenCancelled() async throws {
    let reporter = FakeReporter()
    let clock = HeartbeatClock()
    let presence = makePresence(reporter: reporter, clock: clock)
    let live = try watching(viewers(3))

    let running = Task { await presence.run(live) }
    try await waitUntil { await clock.pending == 1 }
    running.cancel()
    await clock.tick()
    await running.value

    #expect(await reporter.reports == [channelID])
    #expect(await clock.waited == [.seconds(20)])
  }

  @Test("une attente interrompue arrête la présence")
  func stopsWhenWaitThrows() async throws {
    let reporter = FakeReporter()
    let presence = ChannelPresence(channels: FakeChannels(), reporter: reporter, wait: { _ in throw CancellationError() })

    try await presence.run(watching(viewers(3)))

    #expect(await reporter.reports == [channelID])
  }

  @Test("le compteur de viewers qui bouge ne relance pas la présence, la fin du live ou l'arrière-plan si")
  func watchingIdentity() throws {
    #expect(try watching(viewers(3)) == watching(viewers(4)))
    #expect(try watching(viewers(3)) == watching(.live(viewers: nil)))
    #expect(try watching(viewers(3)) != watching(.offline))
    #expect(try watching(viewers(3)) != watching(viewers(3), isForeground: false))
    #expect(try watching(viewers(3)) != ChannelPresence.Watching(
      slug: ChannelSlug("autre_chaine"),
      status: viewers(3),
      isForeground: true
    ))
  }
}
