import Domain
import Observation

public enum BrowsePhase: Equatable, Sendable {
  case idle
  case loading
  case loaded
  case failed
}

@MainActor
@Observable
public final class BrowseStore {
  public private(set) var categories: [BrowseCategory] = []
  public private(set) var phase: BrowsePhase = .idle

  private let directory: any CategoryDirectory

  public init(directory: any CategoryDirectory) {
    self.directory = directory
  }

  public func loadIfNeeded() async {
    guard phase == .idle else { return }
    await load()
  }

  public func load() async {
    guard phase != .loading else { return }
    phase = .loading
    do {
      categories = try await directory.categories()
      phase = .loaded
    } catch {
      phase = .failed
    }
  }
}
