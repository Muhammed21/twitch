import Foundation

public struct Account: Equatable, Sendable {
  public let id: UUID
  public let name: String
  public let email: String

  public init(id: UUID, name: String, email: String) {
    self.id = id
    self.name = name
    self.email = email
  }
}

public protocol AccountRepository: Sendable {
  func currentAccount() async throws -> Account
}
