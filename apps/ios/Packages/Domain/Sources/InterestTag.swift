public struct InterestTag: Hashable, Sendable {
  public let name: String
  public let categoryCount: Int

  public init(name: String, categoryCount: Int) {
    self.name = name
    self.categoryCount = categoryCount
  }
}

public protocol CategoryTagDirectory: Sendable {
  func tags() async throws -> [InterestTag]
}
