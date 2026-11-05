import Foundation
import Observation

public enum AppMode: String, Sendable {
  case viewer
  case creator

  var other: AppMode {
    switch self {
    case .viewer: .creator
    case .creator: .viewer
    }
  }
}

public enum ModeSwitchAction: Sendable {
  case enterDashboard
  case leaveDashboard
}

@MainActor
public protocol AppModeStorage {
  func load() -> AppMode?
  func save(_ mode: AppMode)
}

@MainActor
@Observable
public final class CreatorMode {
  public private(set) var mode: AppMode
  public private(set) var transition: AppMode?
  public var isShowingActions = false

  private let storage: any AppModeStorage
  private let hold: Duration
  private let sleep: @Sendable (Duration) async -> Void

  public init(
    storage: any AppModeStorage,
    hold: Duration,
    sleep: @escaping @Sendable (Duration) async -> Void = { try? await Task.sleep(for: $0) }
  ) {
    self.storage = storage
    self.hold = hold
    self.sleep = sleep
    mode = storage.load() ?? .viewer
  }

  public var switchAction: ModeSwitchAction {
    switch mode {
    case .viewer: .enterDashboard
    case .creator: .leaveDashboard
    }
  }

  public func showActions() {
    isShowingActions = true
  }

  public func dismissActions() {
    isShowingActions = false
  }

  public func switchMode() async {
    guard transition == nil else { return }
    let target = mode.other
    isShowingActions = false
    transition = target
    await sleep(hold)
    guard transition == target else { return }
    mode = target
    storage.save(target)
    transition = nil
  }

  public func reset() {
    isShowingActions = false
    transition = nil
    mode = .viewer
    storage.save(.viewer)
  }
}
