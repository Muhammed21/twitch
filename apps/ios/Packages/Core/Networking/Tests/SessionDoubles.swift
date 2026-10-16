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
