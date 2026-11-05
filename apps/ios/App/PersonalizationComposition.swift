import Auth
import Domain
import Foundation
import Networking
import Onboarding
import Preferences
import SwiftUI

struct PersonalizationRoot: View {
  static let steps: [PersonalizationStep] = [.intro, .categories, .interests, .contentPreferences, .liveLanguage, .summary]

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

extension Composition {
  static func categoryChoices(
    apiBaseURL: URL,
    transport: ClientVersionTransport,
    tokens: OAuthSession,
    now: @escaping @Sendable () -> Date
  ) -> CategoryChoices {
    CategoryChoices(
      directory: CategoryDirectoryClient(apiBaseURL: apiBaseURL, transport: transport),
      following: CategoryFollowClient(apiBaseURL: apiBaseURL, transport: transport, tokens: tokens, now: now)
    )
  }
}
