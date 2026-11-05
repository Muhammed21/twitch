import Domain
import Foundation

@MainActor
public protocol AnalyticsBackend {
  func capture(_ name: String, properties: [String: AnalyticsValue])
  func identify(_ distinctID: String)
  func reset()
}

@MainActor
public final class ProductAnalytics: Analytics, AnalyticsIdentity {
  static let identifiedUserKey = "analytics.identifiedUserID"

  let backend: any AnalyticsBackend
  private let defaults: UserDefaults

  public init(backend: any AnalyticsBackend, defaults: UserDefaults) {
    self.backend = backend
    self.defaults = defaults
  }

  public func capture(_ event: AnalyticsEvent) {
    backend.capture(event.name.rawValue, properties: event.properties)
  }

  public var isEnabled: Bool {
    !(backend is DisabledBackend)
  }

  public func identify(_ userID: UUID) {
    guard isEnabled else { return }
    let distinctID = userID.uuidString.lowercased()
    let identified = defaults.string(forKey: Self.identifiedUserKey)
    guard identified != distinctID else { return }
    if identified != nil {
      backend.reset()
    }
    backend.identify(distinctID)
    defaults.set(distinctID, forKey: Self.identifiedUserKey)
  }

  public func reset() {
    backend.reset()
    defaults.removeObject(forKey: Self.identifiedUserKey)
  }
}
