import Chat
import Domain
import Foundation
import os

let channel = ChannelID(UUID(uuidString: "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69") ?? UUID())
let batchInterval = Duration.milliseconds(100)

func message(_ index: Int, id: UUID = UUID()) -> ChatMessage {
  ChatMessage(
    id: id,
    channelID: channel,
    sessionID: nil,
    author: ChatAuthor(id: UUID(), displayName: "Viewer \(index)"),
    body: "message \(index)",
    sentAt: Date(timeIntervalSince1970: 1_793_736_900)
  )
}

actor FakeConnection: ChatConnection {
  private var queue: [Result<ChatEvent?, any Error>] = []
  private var waiting: CheckedContinuation<ChatEvent?, any Error>?
  private var outcomes: [ChatSendOutcome]
  private(set) var delivered = 0
  private(set) var joined: [ChannelID] = []
  private(set) var sent: [String] = []
  private(set) var isClosed = false

  init(outcomes: [ChatSendOutcome] = []) {
    self.outcomes = outcomes
  }

  nonisolated var events: AsyncThrowingStream<ChatEvent, any Error> {
    AsyncThrowingStream {
      try await withTaskCancellationHandler {
        try await self.next()
      } onCancel: {
        Task { await self.deliver(.success(nil)) }
      }
    }
  }

  func emit(_ events: [ChatEvent]) {
    events.forEach { deliver(.success($0)) }
  }

  func drop(_ error: any Error) {
    deliver(.failure(error))
  }

  func join(_ channel: ChannelID) {
    joined.append(channel)
  }

  func leave(_: ChannelID) {}

  func send(_ body: String, in _: ChannelID) throws -> ChatSendOutcome {
    sent.append(body)
    guard !outcomes.isEmpty else {
      throw ChatConnectionError.ackTimedOut
    }
    return outcomes.removeFirst()
  }

  func close() {
    isClosed = true
    deliver(.success(nil))
  }

  private func next() async throws -> ChatEvent? {
    guard !Task.isCancelled else {
      return nil
    }
    guard queue.isEmpty else {
      return try take(queue.removeFirst())
    }
    return try await withCheckedThrowingContinuation { waiting = $0 }
  }

  private func take(_ result: Result<ChatEvent?, any Error>) throws -> ChatEvent? {
    let event = try result.get()
    delivered += event == nil ? 0 : 1
    return event
  }

  private func deliver(_ result: Result<ChatEvent?, any Error>) {
    guard let continuation = waiting else {
      queue.append(result)
      return
    }
    waiting = nil
    continuation.resume(with: Result { try take(result) })
  }
}

enum Attempt {
  case refused(ChatConnectionError)
  case open(FakeConnection)
}

actor FakeConnector: ChatConnector {
  private var script: [Attempt]
  private(set) var tokens: [String] = []
  private(set) var parked: [FakeConnection] = []

  init(_ script: [Attempt]) {
    self.script = script
  }

  func connect(accessToken: String) throws -> any ChatConnection {
    tokens.append(accessToken)
    guard !script.isEmpty else {
      let connection = FakeConnection()
      parked.append(connection)
      return connection
    }
    switch script.removeFirst() {
    case let .refused(error): throw error
    case let .open(connection): return connection
    }
  }
}

actor FakeTokens: AccessTokenProvider {
  private var issued = 0
  private(set) var rejected: [String] = []

  func accessToken(at _: Date) -> String {
    issued += 1
    return "token-\(issued)"
  }

  func accessTokenRejected(_ token: String, at _: Date) -> String {
    rejected.append(token)
    issued += 1
    return "fresh-\(issued)"
  }
}

actor TestClock {
  private struct Sleeper {
    let duration: Duration
    let continuation: CheckedContinuation<Void, Never>
  }

  private let held: Set<Duration>
  private var sleepers: [Sleeper] = []
  private(set) var waited: [Duration] = []

  init(holding held: Set<Duration> = [batchInterval]) {
    self.held = held
  }

  func wait(_ duration: Duration) async {
    waited.append(duration)
    guard held.contains(duration) else {
      return
    }
    await withCheckedContinuation { sleepers.append(Sleeper(duration: duration, continuation: $0)) }
  }

  var backoffs: [Duration] {
    waited.filter { !held.contains($0) }
  }

  func waits(on duration: Duration) -> Int {
    sleepers.filter { $0.duration == duration }.count
  }

  func fire(_ duration: Duration) {
    let due = sleepers.filter { $0.duration == duration }
    sleepers.removeAll { $0.duration == duration }
    due.forEach { $0.continuation.resume() }
  }
}

final class TestNow: Sendable {
  private let current = OSAllocatedUnfairLock(initialState: Date(timeIntervalSince1970: 1_793_736_900))

  func date() -> Date {
    current.withLock { $0 }
  }

  func advance(by seconds: TimeInterval) {
    current.withLock { $0 += seconds }
  }
}

final class LogBook: Sendable {
  private let lines = OSAllocatedUnfairLock(initialState: [String]())

  var entries: [String] {
    lines.withLock { $0 }
  }

  func write(_ line: String) {
    lines.withLock { $0.append(line) }
  }
}

struct Unreachable: Error {}

actor FakeChannels: ChannelRepository {
  private var failures: Int
  private var ids: [String: ChannelID]
  private let owners: [String: UUID]
  private let unreachable: Set<String>
  private(set) var lookups: [String] = []

  init(
    failures: Int = 0,
    ids: [String: ChannelID] = [:],
    owners: [String: UUID] = [:],
    unreachable: Set<String> = []
  ) {
    self.failures = failures
    self.ids = ids
    self.owners = owners
    self.unreachable = unreachable
  }

  func channel(withSlug slug: ChannelSlug) throws -> Channel {
    lookups.append(slug.rawValue)
    guard !unreachable.contains(slug.rawValue) else {
      throw Unreachable()
    }
    guard failures == 0 else {
      failures -= 1
      throw Unreachable()
    }
    return Channel(
      id: ids[slug.rawValue] ?? ChatTests.channel,
      slug: slug,
      title: "Speedrun",
      ownerID: owners[slug.rawValue] ?? UUID()
    )
  }
}

struct TimeoutCall: Equatable {
  let user: UUID
  let channel: ChannelID
  let duration: Duration
}

actor FakeModeration: ChatModeration {
  private let error: (any Error)?
  private let holding: Bool
  private var held: [CheckedContinuation<Void, Never>] = []
  private(set) var calls: [TimeoutCall] = []

  init(failing error: (any Error)? = nil, holding: Bool = false) {
    self.error = error
    self.holding = holding
  }

  func timeout(_ user: UUID, in channel: ChannelID, for duration: Duration) async throws {
    calls.append(TimeoutCall(user: user, channel: channel, duration: duration))
    if holding {
      await withCheckedContinuation { held.append($0) }
    }
    if let error {
      throw error
    }
  }

  func release() {
    held.forEach { $0.resume() }
    held = []
  }
}

@MainActor
final class TestViewer {
  var id: UUID?

  init(_ id: UUID?) {
    self.id = id
  }
}

struct TimedOut: Error {}

@MainActor
func waitUntil(_ condition: @MainActor () async -> Bool) async throws {
  let deadline = ContinuousClock.now + .seconds(2)
  while await !condition() {
    guard ContinuousClock.now < deadline else {
      throw TimedOut()
    }
    try await Task.sleep(for: .milliseconds(5))
  }
}

@MainActor
func running(_ session: ChatSession) -> Task<Void, Never> {
  Task { await session.run(in: channel) }
}

@MainActor
func makeSession(
  _ connector: FakeConnector,
  tokens: any AccessTokenProvider = FakeTokens(),
  clock: TestClock = TestClock(),
  window: Int = 300,
  jitter: @escaping @Sendable (Duration) -> Duration = { $0 },
  channels: FakeChannels = FakeChannels(),
  moderation: FakeModeration = FakeModeration(),
  viewer: TestViewer = TestViewer(UUID()),
  now: TestNow = TestNow(),
  log: LogBook = LogBook()
) -> ChatSession {
  ChatSession(
    connector: connector,
    tokens: tokens,
    channels: channels,
    moderation: moderation,
    viewer: { viewer.id },
    window: window,
    wait: { await clock.wait($0) },
    jitter: jitter,
    now: { now.date() },
    log: { log.write($0) }
  )
}
