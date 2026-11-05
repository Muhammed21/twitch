import Foundation

public struct Account: Equatable, Sendable {
  public let id: UUID
  public let name: String
  public let email: String
  public let bio: String?
  public let lastLiveAt: Date?
  public let avatarURL: URL?
  public let chatColor: String?

  public init(
    id: UUID,
    name: String,
    email: String,
    bio: String? = nil,
    lastLiveAt: Date? = nil,
    avatarURL: URL? = nil,
    chatColor: String? = nil
  ) {
    self.id = id
    self.name = name
    self.email = email
    self.bio = bio
    self.lastLiveAt = lastLiveAt
    self.avatarURL = avatarURL
    self.chatColor = chatColor
  }
}

public protocol AccountRepository: Sendable {
  func currentAccount() async throws -> Account
}

public protocol ProfileEditor: Sendable {
  func updateBio(_ bio: String) async throws -> Account
}

public enum Bio {
  public static let maxLength = 300

  public static func remaining(in text: String) -> Int {
    maxLength - text.trimmingCharacters(in: .whitespacesAndNewlines).count
  }

  public static func fits(_ text: String) -> Bool {
    remaining(in: text) >= 0
  }
}
