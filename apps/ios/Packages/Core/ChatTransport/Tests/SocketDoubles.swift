@testable import ChatTransport
import Domain
import Foundation

struct SocketGone: Error, Equatable {}

actor FakeWebSocket: WebSocket {
  private var inbox: [Result<String, any Error>] = []
  private var waiting: CheckedContinuation<String, any Error>?
  private(set) var sent: [String] = []
  private(set) var isClosed = false

  init(frames: [String] = []) {
    inbox = frames.map { .success($0) }
  }

  func push(_ text: String) {
    deliver(.success(text))
  }

  func fail(_ error: any Error) {
    deliver(.failure(error))
  }

  func send(_ text: String) {
    sent.append(text)
  }

  func receive() async throws -> String {
    guard inbox.isEmpty else {
      return try inbox.removeFirst().get()
    }
    return try await withCheckedThrowingContinuation { waiting = $0 }
  }

  func close() {
    isClosed = true
    deliver(.failure(SocketGone()))
  }

  private func deliver(_ result: Result<String, any Error>) {
    guard let continuation = waiting else {
      inbox.append(result)
      return
    }
    waiting = nil
    continuation.resume(with: result)
  }
}

actor ManualClock {
  private let uncancellable: Duration?
  private var started: [Duration] = []
  private struct Sleeper {
    let id: UUID
    let duration: Duration
    let continuation: CheckedContinuation<Void, Never>
  }

  private var sleepers: [Sleeper] = []

  init(uncancellable: Duration? = nil) {
    self.uncancellable = uncancellable
  }

  func sleep(for duration: Duration) async {
    started.append(duration)
    guard duration != uncancellable else {
      await withCheckedContinuation { sleepers.append(Sleeper(id: UUID(), duration: duration, continuation: $0)) }
      return
    }
    let id = UUID()
    await withTaskCancellationHandler {
      await withCheckedContinuation { continuation in
        guard !Task.isCancelled else {
          continuation.resume()
          return
        }
        sleepers.append(Sleeper(id: id, duration: duration, continuation: continuation))
      }
    } onCancel: {
      Task { await self.wake(id) }
    }
  }

  func onlyWaits(on duration: Duration, afterStarting count: Int) -> Bool {
    started.filter { $0 == duration }.count == count && pending == [duration]
  }

  var pending: [Duration] {
    sleepers.map(\.duration)
  }

  func fire(_ duration: Duration) {
    guard let index = sleepers.firstIndex(where: { $0.duration == duration }) else {
      return
    }
    sleepers.remove(at: index).continuation.resume()
  }

  private func wake(_ id: UUID) {
    guard let index = sleepers.firstIndex(where: { $0.id == id }) else {
      return
    }
    sleepers.remove(at: index).continuation.resume()
  }
}

func eventually(_ condition: @Sendable () async -> Bool) async -> Bool {
  while await !condition() {
    do {
      try await Task.sleep(for: .milliseconds(1))
    } catch {
      return false
    }
  }
  return true
}

let openFrame = #"0{"sid":"s","upgrades":[],"pingInterval":30000,"pingTimeout":60000,"maxPayload":4096}"#
let watchdogDelay = Duration.seconds(90)
let ackDelay = Duration.seconds(10)
let handshakeDelay = Duration.seconds(5)
let channel = ChannelID(UUID(uuidString: "9B8A7F6E-5D4C-4B3A-8F10-1E2D3C4B5A69") ?? UUID())

func openSocket(
  _ socket: FakeWebSocket = FakeWebSocket(frames: [openFrame, "40"]),
  clock: ManualClock = ManualClock()
) async throws -> ChatSocket {
  try await ChatSocket.open(
    socket: socket,
    handshakeTimeout: handshakeDelay,
    ackTimeout: ackDelay,
    sleep: { await clock.sleep(for: $0) }
  )
}
