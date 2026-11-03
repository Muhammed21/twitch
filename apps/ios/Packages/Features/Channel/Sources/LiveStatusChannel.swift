import Domain
import Foundation
import Observation

@MainActor
@Observable
public final class LiveStatusChannel {
  public typealias Wait = @Sendable (Duration) async throws -> Void

  private static let maxDelaySeconds = 30

  public private(set) var status: LiveStatus?
  public private(set) var isReconnecting = false

  @ObservationIgnored private let channels: any ChannelRepository
  @ObservationIgnored private let source: any LiveStatusSource
  @ObservationIgnored private let onEnded: @MainActor () -> Void
  @ObservationIgnored private let wait: Wait

  public init(
    channels: any ChannelRepository,
    source: any LiveStatusSource,
    onEnded: @escaping @MainActor () -> Void,
    wait: @escaping Wait = { try await Task.sleep(for: $0) }
  ) {
    self.channels = channels
    self.source = source
    self.onEnded = onEnded
    self.wait = wait
  }

  public func run(_ slug: ChannelSlug) async {
    status = nil
    isReconnecting = false
    var failures = 0
    var channel: ChannelID?
    while !Task.isCancelled {
      do {
        let id = if let channel {
          channel
        } else {
          try await channels.channel(withSlug: slug).id
        }
        channel = id
        for try await next in try await source.statuses(of: id) {
          apply(next)
          failures = 0
        }
      } catch {}
      guard !Task.isCancelled else { return }
      isReconnecting = true
      try? await wait(Self.delay(after: failures))
      failures += 1
    }
  }

  private func apply(_ next: LiveStatus) {
    isReconnecting = false
    if case .live = status, next == .offline { onEnded() }
    status = next
  }

  private static func delay(after failures: Int) -> Duration {
    .seconds(min(maxDelaySeconds, 1 << min(failures, 5)))
  }
}
