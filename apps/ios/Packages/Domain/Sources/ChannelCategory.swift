import Foundation

public struct CategoryID: Hashable, Sendable {
  public let rawValue: UUID

  public init(_ rawValue: UUID) {
    self.rawValue = rawValue
  }
}

public struct ChannelCategory: Hashable, Sendable, Identifiable {
  public let id: CategoryID
  public let name: String

  public init(id: CategoryID, name: String) {
    self.id = id
    self.name = name
  }
}

public enum CategoryChange: Equatable, Sendable {
  case keep
  case set(CategoryID)
  case clear

  public static func from(_ current: ChannelCategory?, to chosen: ChannelCategory?) -> CategoryChange {
    switch (current, chosen) {
    case let (current, chosen?) where current?.id != chosen.id: .set(chosen.id)
    case (.some, nil): .clear
    default: .keep
    }
  }
}

public protocol CategoryCatalog: Sendable {
  func categories(matching query: String) async throws -> [ChannelCategory]
}
