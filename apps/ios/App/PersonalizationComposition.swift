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
  @State private var categories: CategoryChoices
  @State private var interests: InterestChoices

  init(session: SessionStore, preferences: PreferencesStore, sources: PersonalizationSources) {
    let choices = sources.choices(preferences: preferences)
    _categories = State(initialValue: choices.categories)
    _interests = State(initialValue: choices.interests)
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
      .environment(categories)
      .environment(interests)
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

struct PersonalizationSources {
  let categories: any CategoryDirectory
  let following: any CategoryFollowing
  let tags: any CategoryTagDirectory

  @MainActor
  func choices(preferences: PreferencesStore) -> (categories: CategoryChoices, interests: InterestChoices) {
    (
      CategoryChoices(directory: categories, following: following),
      InterestChoices(tags: tags, preferences: preferences)
    )
  }
}

extension Composition {
  static func personalizationSources(
    apiBaseURL: URL,
    transport: ClientVersionTransport,
    tokens: OAuthSession,
    now: @escaping @Sendable () -> Date
  ) -> PersonalizationSources {
    PersonalizationSources(
      categories: CategoryDirectoryClient(apiBaseURL: apiBaseURL, transport: transport),
      following: CategoryFollowClient(apiBaseURL: apiBaseURL, transport: transport, tokens: tokens, now: now),
      tags: CategoryTagClient(apiBaseURL: apiBaseURL, transport: transport)
    )
  }
}
