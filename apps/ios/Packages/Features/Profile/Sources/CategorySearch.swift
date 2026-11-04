import Domain
import Observation

@MainActor
@Observable
public final class CategorySearch {
  public enum Phase: Equatable, Sendable {
    case idle
    case loading
    case results([ChannelCategory])
    case failed
  }

  public private(set) var phase: Phase = .idle

  @ObservationIgnored private var latest = 0
  @ObservationIgnored private let catalog: any CategoryCatalog

  public init(catalog: any CategoryCatalog) {
    self.catalog = catalog
  }

  public func search(_ query: String) async {
    latest += 1
    let request = latest
    phase = .loading
    let answer: Phase
    do {
      answer = try await .results(catalog.categories(matching: query))
    } catch {
      answer = .failed
    }
    guard request == latest, !Task.isCancelled else { return }
    phase = answer
  }
}
