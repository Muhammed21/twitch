import Domain
import Foundation
import os

public final class InMemoryPreferences: DevicePreferencesRepository {
  private struct Stored {
    let preferences: DevicePreferences
    let completed: Set<UUID>
  }

  private let stored: OSAllocatedUnfairLock<Stored>

  public init(language: LiveLanguage) {
    stored = OSAllocatedUnfairLock(initialState: Stored(preferences: .defaults(language: language), completed: []))
  }

  public func load() -> DevicePreferences {
    stored.withLock { $0.preferences }
  }

  public func save(_ preferences: DevicePreferences) {
    stored.withLock { $0 = Stored(preferences: preferences, completed: $0.completed) }
  }

  public func completedOnboardingAccounts() -> Set<UUID> {
    stored.withLock { $0.completed }
  }

  public func saveCompletedOnboardingAccounts(_ accounts: Set<UUID>) {
    stored.withLock { $0 = Stored(preferences: $0.preferences, completed: accounts) }
  }
}
