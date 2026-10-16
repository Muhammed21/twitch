import Foundation
import Security

public protocol TokenStore: Sendable {
  func load() throws -> TokenSet?
  func save(_ tokens: TokenSet) throws
  func clear() throws
}

public struct KeychainError: Error, Equatable, Sendable {
  public let status: OSStatus
}

public struct KeychainTokenStore: TokenStore {
  private static let account = "oauth-tokens"

  public let service: String

  public init(service: String) {
    self.service = service
  }

  public func load() throws -> TokenSet? {
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query(adding: [
      kSecReturnData: true,
      kSecMatchLimit: kSecMatchLimitOne,
    ]) as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data else { throw KeychainError(status: status) }
    return try JSONDecoder().decode(TokenSet.self, from: data)
  }

  public func save(_ tokens: TokenSet) throws {
    let contents: [CFString: Any] = try [
      kSecValueData: JSONEncoder().encode(tokens),
      kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let updated = SecItemUpdate(query(adding: [:]) as CFDictionary, contents as CFDictionary)
    if updated == errSecSuccess { return }
    guard updated == errSecItemNotFound else { throw KeychainError(status: updated) }
    let added = SecItemAdd(query(adding: contents) as CFDictionary, nil)
    guard added == errSecSuccess else { throw KeychainError(status: added) }
  }

  public func clear() throws {
    let status = SecItemDelete(query(adding: [:]) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else { throw KeychainError(status: status) }
  }

  private func query(adding attributes: [CFString: Any]) -> [CFString: Any] {
    attributes.merging([
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: service,
      kSecAttrAccount: Self.account,
    ]) { current, _ in current }
  }
}
