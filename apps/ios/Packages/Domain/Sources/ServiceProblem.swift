public struct ServiceProblem: Error, Equatable, Sendable {
  public let type: String
  public let title: String
  public let status: Int
  public let detail: String?

  public init(type: String, title: String, status: Int, detail: String?) {
    self.type = type
    self.title = title
    self.status = status
    self.detail = detail
  }
}
