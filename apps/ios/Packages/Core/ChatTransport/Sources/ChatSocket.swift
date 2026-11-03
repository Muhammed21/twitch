import Domain
import Foundation

protocol WebSocket: Sendable {
  func send(_ text: String) async throws
  func receive() async throws -> String
  func close() async
}

typealias Sleep = @Sendable (Duration) async throws -> Void

actor ChatSocket: ChatConnection {
  nonisolated let events: AsyncThrowingStream<ChatEvent, any Error>
  private(set) var invalidFrames = 0

  private let socket: any WebSocket
  private let ackTimeout: Duration
  private let watchdogDelay: Duration
  private let sleep: Sleep
  private let subscriber: AsyncThrowingStream<ChatEvent, any Error>.Continuation
  private let outbox: AsyncStream<String>.Continuation
  private var pending: [Int: CheckedContinuation<ChatSendOutcome, any Error>] = [:]
  private var timers: [Int: Task<Void, Never>] = [:]
  private var tasks: [Task<Void, Never>] = []
  private var watchdog: Task<Void, Never>?
  private var watchdogGeneration = 0
  private var nextAckID = 0
  private var isClosed = false

  static func open(
    socket: any WebSocket,
    handshakeTimeout: Duration,
    ackTimeout: Duration,
    sleep: @escaping Sleep
  ) async throws -> ChatSocket {
    let nextFrame: () async throws -> ServerFrame? = {
      try await ServerFrame.parse(Self.receive(from: socket, within: handshakeTimeout, sleep: sleep))
    }
    do {
      guard case let .open(pingInterval, pingTimeout) = try await nextFrame() else {
        throw ChatConnectionError.unavailable
      }
      try await socket.send(ClientFrame.connect.text)
      switch try await nextFrame() {
      case .connected: break
      case let .connectError(message): throw ChatConnectionError.refused(message)
      default: throw ChatConnectionError.unavailable
      }
      let chat = ChatSocket(
        socket: socket,
        ackTimeout: ackTimeout,
        watchdogDelay: pingInterval + pingTimeout,
        sleep: sleep
      )
      await chat.start()
      return chat
    } catch {
      await socket.close()
      throw error
    }
  }

  private static func receive(
    from socket: any WebSocket,
    within timeout: Duration,
    sleep: @escaping Sleep
  ) async throws -> String {
    try await withThrowingTaskGroup(of: String?.self) { group in
      group.addTask { try await socket.receive() }
      group.addTask {
        try await sleep(timeout)
        return nil
      }
      defer { group.cancelAll() }
      guard let first = try await group.next(), let text = first else {
        await socket.close()
        throw ChatConnectionError.unavailable
      }
      return text
    }
  }

  private init(socket: any WebSocket, ackTimeout: Duration, watchdogDelay: Duration, sleep: @escaping Sleep) {
    self.socket = socket
    self.ackTimeout = ackTimeout
    self.watchdogDelay = watchdogDelay
    self.sleep = sleep
    (events, subscriber) = AsyncThrowingStream.makeStream()
    let (frames, outbox) = AsyncStream<String>.makeStream()
    self.outbox = outbox
    tasks = [
      Task.detached { [socket] in
        for await frame in frames {
          try? await socket.send(frame)
        }
      },
    ]
  }

  deinit {
    watchdog?.cancel()
    timers.values.forEach { $0.cancel() }
    tasks.forEach { $0.cancel() }
    outbox.finish()
    subscriber.finish(throwing: ChatConnectionError.closed)
  }

  func join(_ channel: ChannelID) throws {
    try transmit(.join(channel))
  }

  func leave(_ channel: ChannelID) throws {
    try transmit(.leave(channel))
  }

  func send(_ body: String, in channel: ChannelID) async throws -> ChatSendOutcome {
    guard !isClosed else {
      throw ChatConnectionError.closed
    }
    let id = nextAckID
    nextAckID += 1
    return try await withCheckedThrowingContinuation { continuation in
      pending[id] = continuation
      timers[id] = Task.detached { [weak self, sleep, ackTimeout] in
        try? await sleep(ackTimeout)
        await self?.resolve(id, with: .failure(ChatConnectionError.ackTimedOut))
      }
      outbox.yield(ClientFrame.send(ackID: id, body: body, channel: channel).text)
    }
  }

  func close() async {
    await finish(throwing: nil)
  }

  private func start() {
    armWatchdog()
    tasks.append(Task { [weak self, socket] in
      while true {
        let text: String
        do {
          text = try await socket.receive()
        } catch {
          await self?.finish(throwing: error)
          return
        }
        guard let self else {
          await socket.close()
          return
        }
        await handle(ServerFrame.parse(text))
      }
    })
  }

  private func transmit(_ frame: ClientFrame) throws {
    guard !isClosed else {
      throw ChatConnectionError.closed
    }
    outbox.yield(frame.text)
  }

  private func handle(_ frame: ServerFrame?) async {
    switch frame {
    case .ping:
      armWatchdog()
      outbox.yield(ClientFrame.pong.text)
    case let .event(name, payload):
      guard let event = ServerPayload.event(name: name, payload: payload) else {
        invalidFrames += 1
        return
      }
      subscriber.yield(event)
    case let .ack(id, payload):
      guard pending[id] != nil, let outcome = ServerPayload.sendOutcome(payload) else {
        invalidFrames += 1
        return
      }
      resolve(id, with: .success(outcome))
    case .close, .disconnected:
      await finish(throwing: ChatConnectionError.closed)
    default:
      invalidFrames += 1
    }
  }

  private func resolve(_ id: Int, with result: Result<ChatSendOutcome, any Error>) {
    timers.removeValue(forKey: id)?.cancel()
    pending.removeValue(forKey: id)?.resume(with: result)
  }

  private func armWatchdog() {
    watchdog?.cancel()
    watchdogGeneration += 1
    let generation = watchdogGeneration
    watchdog = Task.detached { [weak self, sleep, watchdogDelay] in
      guard await (try? sleep(watchdogDelay)) != nil else {
        return
      }
      await self?.expireWatchdog(generation)
    }
  }

  private func expireWatchdog(_ generation: Int) async {
    guard generation == watchdogGeneration else {
      return
    }
    await finish(throwing: ChatConnectionError.unavailable)
  }

  private func finish(throwing error: (any Error)?) async {
    guard !isClosed else {
      return
    }
    isClosed = true
    watchdog?.cancel()
    pending.keys.forEach { resolve($0, with: .failure(ChatConnectionError.closed)) }
    tasks.forEach { $0.cancel() }
    outbox.finish()
    subscriber.finish(throwing: error)
    await socket.close()
  }
}
