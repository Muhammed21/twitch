import Foundation

public struct Account: Equatable, Sendable {
  public let id: UUID
  public let name: String
  public let email: String
  public let bio: String?
  public let lastLiveAt: Date?

  public init(id: UUID, name: String, email: String, bio: String? = nil, lastLiveAt: Date? = nil) {
    self.id = id
    self.name = name
    self.email = email
    self.bio = bio
    self.lastLiveAt = lastLiveAt
  }
}

public protocol AccountRepository: Sendable {
  func currentAccount() async throws -> Account
}
