import Domain
import Foundation
import Observation

@MainActor
@Observable
public final class ChannelPresence {
  public typealias Wait = @Sendable (Duration) async throws -> Void

  public struct Watching: Hashable, Sendable {
    let slug: ChannelSlug
    let isLive: Bool
    let isForeground: Bool

    public init(slug: ChannelSlug, status: LiveStatus?, isForeground: Bool) {
      self.slug = slug
      isLive = Self.isLive(status)
      self.isForeground = isForeground
    }

    private static func isLive(_ status: LiveStatus?) -> Bool {
      guard case .live = status else { return false }
      return true
    }
  }

  private static let interval: Duration = .seconds(20)

  @ObservationIgnored private let channels: any ChannelRepository
  @ObservationIgnored private let reporter: any PresenceReporter
  @ObservationIgnored private let wait: Wait

  public init(
    channels: any ChannelRepository,
    reporter: any PresenceReporter,
    wait: @escaping Wait = { try await Task.sleep(for: $0) }
  ) {
    self.channels = channels
    self.reporter = reporter
    self.wait = wait
  }

  public func run(_ watching: Watching) async {
    guard watching.isLive, watching.isForeground else { return }
    var channel: ChannelID?
    while !Task.isCancelled {
      channel = await report(on: channel, slug: watching.slug)
      do {
        try await wait(Self.interval)
      } catch {
        return
      }
    }
  }

  private func report(on channel: ChannelID?, slug: ChannelSlug) async -> ChannelID? {
    guard let id = await resolved(channel, slug) else { return nil }
    try? await reporter.reportPresence(in: id)
    return id
  }

  private func resolved(_ channel: ChannelID?, _ slug: ChannelSlug) async -> ChannelID? {
    if let channel { return channel }
    return try? await channels.channel(withSlug: slug).id
  }
}
