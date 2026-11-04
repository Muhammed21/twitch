import Foundation
import Networking
import os

struct InMemoryTokenStore: TokenStore {
  private let state: OSAllocatedUnfairLock<TokenSet?>

  init(_ tokens: TokenSet? = nil) {
    state = OSAllocatedUnfairLock(initialState: tokens)
  }

  var tokens: TokenSet? { state.withLock { $0 } }

  func load() throws -> TokenSet? {
    tokens
  }

  func save(_ tokens: TokenSet) throws {
    state.withLock { $0 = tokens }
  }

  func clear() throws {
    state.withLock { $0 = nil }
  }
}

actor Gate {
  private var isOpen = false
  private var waiters: [CheckedContinuation<Void, Never>] = []

  func wait() async {
    guard !isOpen else { return }
    await withCheckedContinuation { waiters.append($0) }
  }

  func open() {
    isOpen = true
    waiters.forEach { $0.resume() }
    waiters = []
  }
}

struct NetworkDown: Error {}

final class Arrivals: Sendable {
  private struct Waiter: Sendable {
    let count: Int
    let continuation: CheckedContinuation<Void, Never>
  }

  private struct State: Sendable {
    var count = 0
    var waiters: [Waiter] = []
  }

  private let state = OSAllocatedUnfairLock(initialState: State())

  func arrive() {
    let due = state.withLock { state in
      state.count += 1
      let reached = state.count
      let due = state.waiters.filter { $0.count <= reached }
      state.waiters.removeAll { $0.count <= reached }
      return due
    }
    due.forEach { $0.continuation.resume() }
  }

  func wait(for count: Int) async {
    await withCheckedContinuation { continuation in
      let reached = state.withLock { state in
        guard state.count < count else { return true }
        state.waiters.append(Waiter(count: count, continuation: continuation))
        return false
      }
      if reached { continuation.resume() }
    }
  }
}

extension OAuthSession {
  func arriving<Value: Sendable>(
    _ arrivals: Arrivals,
    _ call: @Sendable (isolated OAuthSession) async throws -> Value
  ) async throws -> Value {
    arrivals.arrive()
    return try await call(self)
  }
}
