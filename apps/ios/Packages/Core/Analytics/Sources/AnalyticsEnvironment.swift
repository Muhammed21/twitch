public enum AnalyticsEnvironment: String, Sendable {
  case debug
  case release

  public static var current: AnalyticsEnvironment {
    #if DEBUG
      .debug
    #else
      .release
    #endif
  }
}
