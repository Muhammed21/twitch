import Foundation
import Navigation
import Testing
@testable import Twitch

@MainActor
@Suite("Mode créateur enregistré d'un lancement à l'autre")
struct CreatorModeStorageTests {
  private func defaults() throws -> UserDefaults {
    let name = "CreatorModeStorageTests.\(UUID().uuidString)"
    return try #require(UserDefaults(suiteName: name))
  }

  @Test("sans mode enregistré, rien n'est relu et l'app s'ouvre en mode spectateur")
  func emptyDefaults() throws {
    let storage = try DefaultsModeStorage(defaults: defaults())

    #expect(storage.load() == nil)
    #expect(CreatorMode(storage: storage, hold: .zero).mode == .viewer)
  }

  @Test("le mode créateur enregistré est relu au lancement suivant")
  func roundTrip() throws {
    let defaults = try defaults()
    DefaultsModeStorage(defaults: defaults).save(.creator)

    #expect(CreatorMode(storage: DefaultsModeStorage(defaults: defaults), hold: .zero).mode == .creator)
  }

  @Test("une valeur illisible est ignorée")
  func unreadable() throws {
    let defaults = try defaults()
    defaults.set("streamer", forKey: DefaultsModeStorage.key)

    #expect(DefaultsModeStorage(defaults: defaults).load() == nil)
  }
}
