import Auth
import Domain
import Foundation
import Networking
import Onboarding
import Preferences
import SwiftUI

struct PersonalizationRoot: View {
  static let steps: [PersonalizationStep] = [
    .intro, .categories, .interests, .contentPreferences, .liveLanguage, .appearance, .videoAutoplay, .notifications, .chat,
    .summary,
  ]

  @State private var journey: PersonalizationJourney
  @State private var categories: CategoryChoices
  @State private var interests: InterestChoices
  @State private var notifications: NotificationChoices

  init(session: SessionStore, preferences: PreferencesStore, sources: PersonalizationSources) {
    let choices = sources.choices(preferences: preferences)
    _categories = State(initialValue: choices.categories)
    _interests = State(initialValue: choices.interests)
    _notifications = State(initialValue: choices.notifications)
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
      .environment(notifications)
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
  let notifications: any NotificationPermission

  @MainActor
  func choices(preferences: PreferencesStore) -> PersonalizationChoices {
    PersonalizationChoices(
      categories: CategoryChoices(directory: categories, following: following),
      interests: InterestChoices(tags: tags, preferences: preferences),
      notifications: NotificationChoices(permission: notifications, onAnswer: { _ in })
    )
  }
}

struct PersonalizationChoices {
  let categories: CategoryChoices
  let interests: InterestChoices
  let notifications: NotificationChoices
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
      tags: CategoryTagClient(apiBaseURL: apiBaseURL, transport: transport),
      notifications: SystemNotificationPermission()
    )
  }
}
