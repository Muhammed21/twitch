import Auth
import Domain
import Foundation
import Onboarding
import Preferences
import SwiftUI

struct PersonalizationRoot: View {
  static let steps: [PersonalizationStep] = [.intro, .summary]

  @State private var journey: PersonalizationJourney

  init(session: SessionStore, preferences: PreferencesStore) {
    _journey = State(initialValue: PersonalizationJourney(
      steps: Self.steps,
      now: { Date.now },
      record: { _ in },
      onFinish: {
        Self.finish(account: session.accountID, preferences: preferences, close: session.finishPersonalization)
      }
    ))
  }

  var body: some View {
    PersonalizationScreen()
      .environment(journey)
  }

  @MainActor
  static func finish(account: UUID?, preferences: PreferencesStore, close: () -> Void) {
    if let account {
      preferences.completeOnboarding(account)
    }
    close()
  }

  @MainActor
  static func preferences() -> PreferencesStore {
    PreferencesStore(
      repository: UserDefaultsPreferences(suiteName: nil, language: LiveLanguage(localeIdentifier: Locale.current.identifier)),
      onChange: { _ in }
    )
  }
}
