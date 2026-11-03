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
  private var sleepers: [(duration: Duration, continuation: CheckedContinuation<Void, Never>)] = []

  func sleep(for duration: Duration) async {
    await withCheckedContinuation { sleepers.append((duration, $0)) }
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
}

func eventually(_ condition: @Sendable () async -> Bool) async -> Bool {
  for _ in 0 ..< 10000 {
    if await condition() {
      return true
    }
    await Task.yield()
  }
  return false
}

let openFrame = #"0{"sid":"s","upgrades":[],"pingInterval":30000,"pingTimeout":60000,"maxPayload":4096}"#
let watchdogDelay = Duration.seconds(90)
let ackDelay = Duration.seconds(10)
let channel = ChannelID(UUID(uuidString: "9B8A7F6E-5D4C-4B3A-8F10-1E2D3C4B5A69") ?? UUID())

func openSocket(
  _ socket: FakeWebSocket = FakeWebSocket(frames: [openFrame, "40"]),
  clock: ManualClock = ManualClock()
) async throws -> ChatSocket {
  try await ChatSocket.open(socket: socket, ackTimeout: ackDelay, sleep: { await clock.sleep(for: $0) })
}
