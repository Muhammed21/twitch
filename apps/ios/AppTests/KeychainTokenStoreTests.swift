import Foundation
import Networking
import Security
import Testing

private let tokens = TokenSet(
  accessToken: "access-1",
  refreshToken: "refresh-1",
  expiresAt: Date(timeIntervalSince1970: 1_800_000_900)
)

private func makeStore() -> KeychainTokenStore {
  KeychainTokenStore(service: "tests.\(UUID().uuidString)")
}

private func storedAttributes(service: String) -> [String: Any]? {
  let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecReturnAttributes as String: true,
    kSecMatchLimit as String: kSecMatchLimitOne,
  ]
  var result: CFTypeRef?
  guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
  return result as? [String: Any]
}

@Suite("Tokens dans le Keychain", .serialized)
struct KeychainTokenStoreTests {
  @Test("relit les tokens enregistrés")
  func roundTrip() throws {
    let store = makeStore()
    defer { try? store.clear() }

    try store.save(tokens)

    #expect(try store.load() == tokens)
  }

  @Test("écrit l'élément avec kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly")
  func accessibility() throws {
    let store = makeStore()
    defer { try? store.clear() }

    try store.save(tokens)

    let attributes = try #require(storedAttributes(service: store.service))
    #expect(attributes[kSecAttrAccessible as String] as? String == kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String)
  }

  @Test("un nouvel enregistrement remplace le précédent")
  func overwrite() throws {
    let store = makeStore()
    defer { try? store.clear() }
    let rotated = TokenSet(accessToken: "access-2", refreshToken: "refresh-2", expiresAt: tokens.expiresAt + 900)

    try store.save(tokens)
    try store.save(rotated)

    #expect(try store.load() == rotated)
  }

  @Test("ne rend rien avant tout enregistrement, ni après effacement")
  func clear() throws {
    let store = makeStore()

    #expect(try store.load() == nil)
    try store.save(tokens)
    try store.clear()
    #expect(try store.load() == nil)
    #expect(storedAttributes(service: store.service) == nil)
  }

  @Test("effacer un Keychain déjà vide ne lève pas d'erreur")
  func clearEmpty() throws {
    try makeStore().clear()
  }

  @Test("deux services ne partagent pas leurs tokens")
  func isolation() throws {
    let store = makeStore()
    defer { try? store.clear() }

    try store.save(tokens)

    #expect(try makeStore().load() == nil)
  }
}
