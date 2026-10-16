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
    try clear()
    let status = try SecItemAdd(query(adding: [
      kSecValueData: JSONEncoder().encode(tokens),
      kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]) as CFDictionary, nil)
    guard status == errSecSuccess else { throw KeychainError(status: status) }
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
