import Channel
import Chat
import Domain
import Foundation
import Observation
import os
import Testing

private let channelID = ChannelID(UUID(uuidString: "4f1c2a3b-5d6e-4f70-8a9b-0c1d2e3f4a5b") ?? UUID())

private struct Cut: Error {}

private struct Channels: ChannelRepository {
  func channel(withSlug slug: ChannelSlug) -> Channel {
    Channel(id: channelID, slug: slug, title: "Speedrun", ownerID: UUID())
  }
}

private struct Tokens: AccessTokenProvider {
  func accessToken(at _: Date) -> String {
    "token"
  }

  func accessTokenRejected(_: String, at _: Date) -> String {
    "fresh"
  }
}

private actor StatusFeed: LiveStatusSource {
  private var current: AsyncThrowingStream<LiveStatus, any Error>.Continuation?
  private(set) var opened = 0

  func statuses(of _: ChannelID) -> AsyncThrowingStream<LiveStatus, any Error> {
    opened += 1
    let (stream, continuation) = AsyncThrowingStream<LiveStatus, any Error>.makeStream()
    current = continuation
    return stream
  }

  func send(_ status: LiveStatus) {
    current?.yield(status)
  }

  func cut() {
    current?.finish(throwing: Cut())
  }
}

private actor ChatFeed: ChatConnector {
  private var current: Room?
  private(set) var opened = 0

  func connect(accessToken _: String) -> any ChatConnection {
    opened += 1
    let room = Room()
    current = room
    return room
  }

  func send(_ messages: [ChatMessage]) {
    messages.forEach { current?.continuation.yield(.message($0)) }
  }

  func cut() {
    current?.continuation.finish(throwing: ChatConnectionError.closed)
  }
}

private final class Room: ChatConnection {
  let events: AsyncThrowingStream<ChatEvent, any Error>
  let continuation: AsyncThrowingStream<ChatEvent, any Error>.Continuation

  init() {
    (events, continuation) = AsyncThrowingStream<ChatEvent, any Error>.makeStream()
  }

  func join(_: ChannelID) {}
  func leave(_: ChannelID) {}
  func send(_: String, in _: ChannelID) -> ChatSendOutcome {
    .accepted
  }

  func close() {
    continuation.finish()
  }
}

private func message(_ index: Int) -> ChatMessage {
  ChatMessage(
    id: UUID(),
    channelID: channelID,
    sessionID: nil,
    author: ChatAuthor(id: UUID(), displayName: "viewer_\(index)"),
    body: "message \(index)",
    sentAt: Date()
  )
}

private func viewers(_ count: Int) throws -> LiveStatus {
  try .live(viewers: ViewerCount(count))
}

private struct TimedOut: Error {}

@MainActor
private func waitUntil(_ condition: @MainActor () async -> Bool) async throws {
  let deadline = ContinuousClock.now + .seconds(3)
  while await !condition() {
    guard ContinuousClock.now < deadline else {
      throw TimedOut()
    }
    try await Task.sleep(for: .milliseconds(5))
  }
}

@MainActor
private struct Page {
  let feed = StatusFeed()
  let chatFeed = ChatFeed()
  let live: LiveStatusChannel
  let chat: ChatSession
  let tasks: [Task<Void, Never>]

  init() throws {
    let slug = try ChannelSlug("jean_dupont")
    live = LiveStatusChannel(channels: Channels(), source: feed, onEnded: {}, onLive: {})
    chat = ChatSession(connector: chatFeed, tokens: Tokens(), channels: Channels(), jitter: { $0 })
    tasks = [Task { [live] in await live.run(slug) }, Task { [chat] in await chat.run(slug) }]
  }

  func ready() async throws {
    try await waitUntil { await feed.opened == 1 && chat.status == .live }
  }

  func close() async {
    tasks.forEach { $0.cancel() }
    for task in tasks {
      await task.value
    }
  }
}

@MainActor
@Suite("Page de chaîne : le chat et le statut du live vivent chacun de leur côté (ADR 0004 §2, ADR 0011)")
struct ChannelPageTests {
  @Test("une coupure du chat laisse le compteur de viewers continuer")
  func chatCutKeepsCounter() async throws {
    let page = try Page()
    try await page.ready()

    await page.chatFeed.cut()
    try await waitUntil { page.chat.status == .reconnecting }
    try await page.feed.send(viewers(42))
    try await waitUntil { page.live.status == (try? viewers(42)) }

    #expect(page.live.isReconnecting == false)
    #expect(page.chat.status == .reconnecting)
    await page.close()
  }

  @Test("une coupure du SSE laisse le chat continuer")
  func statusCutKeepsChat() async throws {
    let page = try Page()
    try await page.ready()
    let sent = message(1)

    await page.feed.cut()
    try await waitUntil { page.live.isReconnecting }
    await page.chatFeed.send([sent])
    try await waitUntil { page.chat.messages == [sent] }

    #expect(page.chat.status == .live)
    #expect(page.live.isReconnecting)
    await page.close()
  }

  @Test("un burst de chat ne touche à rien de ce que lit ChannelHeader")
  func burstLeavesHeaderAlone() async throws {
    let page = try Page()
    try await page.ready()
    try await page.feed.send(viewers(42))
    try await waitUntil { page.live.status == (try? viewers(42)) }
    let invalidated = OSAllocatedUnfairLock(initialState: false)

    withObservationTracking {
      _ = page.live.title
      _ = page.live.status
      _ = page.live.isReconnecting
    } onChange: {
      invalidated.withLock { $0 = true }
    }
    await page.chatFeed.send((1 ... 50).map(message))
    try await waitUntil { page.chat.messages.count == 50 }

    #expect(invalidated.withLock { $0 } == false)
    await page.close()
  }
}
