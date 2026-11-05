import Domain
import Foundation
import Observation

@MainActor
@Observable
public final class PreferencesStore {
  public private(set) var current: DevicePreferences

  private let repository: any DevicePreferencesRepository
  private let onChange: @MainActor (PreferenceChanged) -> Void

  public init(repository: any DevicePreferencesRepository, onChange: @escaping @MainActor (PreferenceChanged) -> Void) {
    self.repository = repository
    self.onChange = onChange
    current = repository.load()
  }

  public func update(_ update: PreferenceUpdate, source: PreferenceSource) {
    let next = current.applying(update)
    guard next != current else { return }
    let announced = current.update(for: update.preference).value != update.value
    repository.save(next)
    current = next
    guard announced else { return }
    onChange(PreferenceChanged(preference: update.preference, value: update.value, source: source))
  }

  public func hasCompletedOnboarding(_ account: UUID) -> Bool {
    repository.completedOnboardingAccounts().contains(account)
  }

  public func completeOnboarding(_ account: UUID) {
    repository.saveCompletedOnboardingAccounts(repository.completedOnboardingAccounts().union([account]))
  }
}
