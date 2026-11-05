import Domain
import Foundation

@MainActor
public final class RecordingAnalytics: Analytics, AnalyticsIdentity {
  public enum Call: Equatable, Sendable {
    case capture(AnalyticsEvent)
    case identify(UUID)
    case reset
  }

  public private(set) var calls: [Call] = []

  public var captured: [AnalyticsEvent] {
    calls.compactMap { call in
      guard case let .capture(event) = call else { return nil }
      return event
    }
  }

  public init() {}

  public func capture(_ event: AnalyticsEvent) {
    calls.append(.capture(event))
  }

  public func identify(_ userID: UUID) {
    calls.append(.identify(userID))
  }

  public func reset() {
    calls.append(.reset)
  }
}
