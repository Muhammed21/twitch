import Dashboard
import Domain
import Foundation
import Testing

private let channelID = ChannelID(UUID(uuidString: "0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d")!)
private let now = Date(timeIntervalSince1970: 1_793_736_000)
private let english = Locale(identifier: "en")
private let unavailable = String(localized: DashboardText.unavailableStat)

private func live(viewers count: Int?, startedSecondsAgo seconds: TimeInterval?) throws -> LiveStatus {
  try .live(viewers: count.map { try ViewerCount($0) }, startedAt: seconds.map { now.addingTimeInterval(-$0) })
}

private func values(_ status: LiveStatus?) -> [String] {
  DashboardHomeScreen.statItems(status: status, now: now, locale: english).map(\.value)
}

private struct Unreachable: Error {}

private enum Connection {
  case refused
  case dropped([LiveStatus])
  case open([LiveStatus])
}

private actor FakeLiveStatusSource: LiveStatusSource {
  private var script: [Connection]
  private var held: [AsyncThrowingStream<LiveStatus, any Error>.Continuation] = []
  private(set) var opened: [ChannelID] = []

  init(_ script: [Connection]) {
    self.script = script
  }

  func statuses(of channel: ChannelID) async throws -> AsyncThrowingStream<LiveStatus, any Error> {
    opened.append(channel)
    let connection = script.isEmpty ? .open([]) : script.removeFirst()
    let (stream, continuation) = AsyncThrowingStream<LiveStatus, any Error>.makeStream()
    switch connection {
    case .refused:
      throw Unreachable()
    case let .dropped(statuses):
      statuses.forEach { continuation.yield($0) }
      continuation.finish(throwing: Unreachable())
    case let .open(statuses):
      statuses.forEach { continuation.yield($0) }
      held.append(continuation)
    }
    return stream
  }
}

@MainActor
private final class Delays {
  private(set) var recorded: [Duration] = []

  func wait(_ delay: Duration) {
    recorded.append(delay)
  }
}

@MainActor
private func waitUntil(_ condition: () async -> Bool) async throws {
  while await !condition() {
    try await Task.sleep(for: .milliseconds(5))
  }
}

@Suite("Chiffres de la chaîne sur l'accueil du tableau de bord (IMG_9624)")
struct DashboardStatValuesTests {
  @Test("hors live, le temps de stream et les spectateurs s'affichent --, comme sur la capture")
  func offline() {
    #expect(values(.offline) == [unavailable, unavailable, unavailable])
  }

  @Test("tant que le statut du live n'est pas connu, chaque chiffre s'affiche --")
  func unknown() {
    #expect(values(nil) == [unavailable, unavailable, unavailable])
  }

  @Test("en live, le temps de stream court depuis le début de la session et les spectateurs suivent le compteur")
  func liveFigures() throws {
    #expect(try values(live(viewers: 1234, startedSecondsAgo: 3723)) == ["1:02:03", "1,234", unavailable])
  }

  @Test("en live, un compteur ou un début inconnu s'affiche --")
  func liveUnknownFigures() throws {
    #expect(try values(live(viewers: nil, startedSecondsAgo: nil)) == [unavailable, unavailable, unavailable])
  }

  @Test("un début daté après l'horloge du téléphone compte zéro seconde de stream")
  func startAhead() throws {
    #expect(try values(live(viewers: 0, startedSecondsAgo: -5)) == ["0:00:00", "0", unavailable])
  }

  @Test("les followers restent -- tant que channel ne porte pas le follow (ADR 0020)")
  func followers() throws {
    let items = try DashboardHomeScreen.statItems(status: live(viewers: 3, startedSecondsAgo: 60), now: now, locale: english)

    #expect(items.last?.id == "\(DashboardStat.followers)")
    #expect(items.last?.value == unavailable)
  }
}

@MainActor
@Suite("DashboardLiveFigures : statut du live de la chaîne du créateur, avec sa reconnexion", .timeLimit(.minutes(1)))
struct DashboardLiveFiguresTests {
  @Test("suit le statut du live de la chaîne demandée")
  func follows() async throws {
    let source = try FakeLiveStatusSource([.open([.offline, live(viewers: 4, startedSecondsAgo: 10)])])
    let figures = DashboardLiveFigures(source: source, wait: { _ in })
    #expect(figures.status == nil)

    let running = Task { await figures.follow(channelID) }
    try await waitUntil { figures.status == (try? live(viewers: 4, startedSecondsAgo: 10)) }
    running.cancel()
    await running.value

    #expect(await source.opened == [channelID])
  }

  @Test("arrêter le suivi efface le statut, pour qu'un suivi suivant ne montre pas les chiffres d'avant")
  func stopClears() async throws {
    let source = try FakeLiveStatusSource([.open([live(viewers: 4, startedSecondsAgo: 10)])])
    let figures = DashboardLiveFigures(source: source, wait: { _ in })

    let running = Task { await figures.follow(channelID) }
    try await waitUntil { figures.status != nil }
    running.cancel()
    await running.value

    #expect(figures.status == nil)
  }

  @Test("une coupure efface le statut, puis reconnecte avec une attente qui double, remise à zéro par un statut reçu")
  func reconnects() async throws {
    let delays = Delays()
    let source = try FakeLiveStatusSource([
      .dropped([live(viewers: 4, startedSecondsAgo: 10)]), .refused, .refused, .dropped([.offline]), .open([]),
    ])
    let figures = DashboardLiveFigures(source: source, wait: { delay in await delays.wait(delay) })

    let running = Task { await figures.follow(channelID) }
    try await waitUntil { await source.opened.count == 5 }
    running.cancel()
    await running.value

    #expect(delays.recorded == [.seconds(1), .seconds(2), .seconds(4), .seconds(1)])
    #expect(figures.status == nil)
  }

  @Test("l'attente avant reconnexion plafonne à 30 secondes")
  func cappedDelay() async throws {
    let delays = Delays()
    let source = FakeLiveStatusSource(Array(repeating: .refused, count: 7) + [.open([])])
    let figures = DashboardLiveFigures(source: source, wait: { delay in await delays.wait(delay) })

    let running = Task { await figures.follow(channelID) }
    try await waitUntil { await source.opened.count == 8 }
    running.cancel()
    await running.value

    #expect(delays.recorded == [1, 2, 4, 8, 16, 30, 30].map { Duration.seconds($0) })
  }
}
