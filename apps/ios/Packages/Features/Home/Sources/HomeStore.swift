import Domain
import Observation

public enum HomePhase: Equatable, Sendable {
  case idle
  case loading
  case loaded(hasMore: Bool)
  case failed
}

@MainActor
@Observable
public final class HomeStore {
  private enum PageRequest {
    case first
    case next(LiveCursor)

    var cursor: LiveCursor? {
      switch self {
      case .first: nil
      case let .next(cursor): cursor
      }
    }
  }

  public private(set) var lives: [LiveChannel] = []
  public private(set) var phase: HomePhase = .idle

  private var nextCursor: LiveCursor?
  private var failedRequest: PageRequest?
  private let directory: any LiveDirectory

  public init(directory: any LiveDirectory) {
    self.directory = directory
  }

  public func loadFirstPage() async {
    await load(.first)
  }

  public func loadNextPage() async {
    guard let nextCursor else { return }
    await load(.next(nextCursor))
  }

  public func retry() async {
    guard let failedRequest else { return }
    await load(failedRequest)
  }

  private func load(_ request: PageRequest) async {
    guard phase != .loading else { return }
    phase = .loading
    do {
      let page = try await directory.lives(after: request.cursor)
      lives = Self.appending(page.lives, to: request.cursor == nil ? [] : lives)
      nextCursor = page.nextCursor
      failedRequest = nil
      phase = .loaded(hasMore: page.nextCursor != nil)
    } catch {
      failedRequest = request
      phase = .failed
    }
  }

  private static func appending(_ page: [LiveChannel], to current: [LiveChannel]) -> [LiveChannel] {
    page.reduce(into: current) { lives, live in
      if !lives.contains(where: { $0.session.channelID == live.session.channelID }) {
        lives.append(live)
      }
    }
  }
}
