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
  public private(set) var lives: [LiveChannel] = []
  public private(set) var phase: HomePhase = .idle

  private var nextCursor: LiveCursor?
  private let directory: any LiveDirectory

  public init(directory: any LiveDirectory) {
    self.directory = directory
  }

  public func loadFirstPage() async {
    await load(after: nil, onto: [])
  }

  public func loadNextPage() async {
    guard let nextCursor else { return }
    await load(after: nextCursor, onto: lives)
  }

  public func retry() async {
    if lives.isEmpty {
      await loadFirstPage()
    } else {
      await loadNextPage()
    }
  }

  private func load(after cursor: LiveCursor?, onto current: [LiveChannel]) async {
    guard phase != .loading else { return }
    phase = .loading
    do {
      let page = try await directory.lives(after: cursor)
      lives = Self.appending(page.lives, to: current)
      nextCursor = page.nextCursor
      phase = .loaded(hasMore: page.nextCursor != nil)
    } catch {
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
