public enum ViewerCountError: Error, Equatable, Sendable {
  case negative
}

public struct ViewerCount: Hashable, Sendable {
  public let value: Int

  public init(_ value: Int) throws(ViewerCountError) {
    guard value >= 0 else {
      throw .negative
    }
    self.value = value
  }
}
