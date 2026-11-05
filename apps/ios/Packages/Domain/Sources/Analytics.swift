import Foundation

@MainActor
public protocol Analytics {
  func capture(_ event: AnalyticsEvent)
}

@MainActor
public protocol AnalyticsIdentity {
  func identify(_ userID: UUID)
  func reset()
}
