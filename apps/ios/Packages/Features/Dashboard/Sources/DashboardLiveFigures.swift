import Domain
import Foundation
import Observation

@MainActor
@Observable
public final class DashboardLiveFigures {
  public typealias Wait = @Sendable (Duration) async throws -> Void

  private static let maxDelaySeconds = 30

  public private(set) var status: LiveStatus?

  @ObservationIgnored private let source: any LiveStatusSource
  @ObservationIgnored private let wait: Wait

  public init(source: any LiveStatusSource, wait: @escaping Wait = { try await Task.sleep(for: $0) }) {
    self.source = source
    self.wait = wait
  }

  public func follow(_ channel: ChannelID) async {
    defer { status = nil }
    var failures = 0
    while !Task.isCancelled {
      do {
        for try await next in try await source.statuses(of: channel) {
          status = next
          failures = 0
        }
      } catch {}
      guard !Task.isCancelled else { return }
      status = nil
      try? await wait(Self.delay(after: failures))
      failures += 1
    }
  }

  private static func delay(after failures: Int) -> Duration {
    .seconds(min(maxDelaySeconds, 1 << min(failures, 5)))
  }
}
