import Domain
import Foundation
import PostHog

@MainActor
struct PostHogBackend: AnalyticsBackend {
  private let sdk: PostHogSDK

  static func start(_ configuration: AnalyticsConfiguration) -> PostHogBackend {
    PostHogSDK.shared.setup(config(configuration))
    return PostHogBackend(sdk: PostHogSDK.shared)
  }

  static func config(_ configuration: AnalyticsConfiguration) -> PostHogConfig {
    let config = PostHogConfig(projectToken: configuration.projectKey, host: configuration.host.absoluteString)
    config.captureApplicationLifecycleEvents = false
    config.captureScreenViews = false
    config.enableSwizzling = false
    config.preloadFeatureFlags = false
    config.sendFeatureFlagEvent = false
    config.sessionReplay = false
    config.setBeforeSend { event in
      event.properties = AnalyticsPrivacy.redacted(event.properties)
      return event
    }
    return config
  }

  func capture(_ name: String, properties: [String: AnalyticsValue]) {
    sdk.capture(name, properties: properties.mapValues(\.sdkValue))
  }

  func identify(_ distinctID: String) {
    sdk.identify(distinctID)
  }

  func reset() {
    sdk.reset()
  }
}

struct DisabledBackend: AnalyticsBackend {
  func capture(_: String, properties _: [String: AnalyticsValue]) {}

  func identify(_: String) {}

  func reset() {}
}

public extension ProductAnalytics {
  static func live(info: [String: Any], defaults: UserDefaults) -> ProductAnalytics {
    let backend: any AnalyticsBackend = AnalyticsConfiguration(info: info).map(PostHogBackend.start) ?? DisabledBackend()
    return ProductAnalytics(backend: backend, defaults: defaults)
  }
}

private extension AnalyticsValue {
  var sdkValue: Any {
    switch self {
    case let .string(value): value
    case let .int(value): value
    case let .bool(value): value
    }
  }
}
