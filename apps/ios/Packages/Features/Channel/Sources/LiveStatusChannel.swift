import Domain
import Foundation
import Observation

@MainActor
@Observable
public final class LiveStatusChannel {
  public typealias Wait = @Sendable (Duration) async throws -> Void

  private static let maxDelaySeconds = 30

  public private(set) var title: String?
  public private(set) var status: LiveStatus?
  public private(set) var isReconnecting = false

  @ObservationIgnored private let channels: any ChannelRepository
  @ObservationIgnored private let source: any LiveStatusSource
  @ObservationIgnored private let onEnded: @MainActor () -> Void
  @ObservationIgnored private let onLive: @MainActor () -> Void
  @ObservationIgnored private let wait: Wait

  public init(
    channels: any ChannelRepository,
    source: any LiveStatusSource,
    onEnded: @escaping @MainActor () -> Void,
    onLive: @escaping @MainActor () -> Void,
    wait: @escaping Wait = { try await Task.sleep(for: $0) }
  ) {
    self.channels = channels
    self.source = source
    self.onEnded = onEnded
    self.onLive = onLive
    self.wait = wait
  }

  public func run(_ slug: ChannelSlug) async {
    title = nil
    status = nil
    isReconnecting = false
    var failures = 0
    var channel: ChannelID?
    while !Task.isCancelled {
      do {
        let id = try await resolved(channel, slug)
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

  private func resolved(_ channel: ChannelID?, _ slug: ChannelSlug) async throws -> ChannelID {
    if let channel { return channel }
    let found = try await channels.channel(withSlug: slug)
    title = found.title
    return found.id
  }

  private func apply(_ next: LiveStatus) {
    isReconnecting = false
    switch (status, next) {
    case (.live, .offline): onEnded()
    case (.offline, .live): onLive()
    default: break
    }
    status = next
  }

  private static func delay(after failures: Int) -> Duration {
    .seconds(min(maxDelaySeconds, 1 << min(failures, 5)))
  }
}
