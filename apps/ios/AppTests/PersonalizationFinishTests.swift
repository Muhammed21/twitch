import Domain
import Foundation
import Onboarding
import Preferences
import Testing
@testable import Twitch

@MainActor
private final class CloseRecorder {
  private(set) var closes = 0

  func close() {
    closes += 1
  }
}

private struct OneCategory: CategoryDirectory {
  func categories(after _: CategoryCursor?) async throws -> CategoryPage {
    try CategoryPage(
      categories: [BrowseCategory(slug: CategorySlug("fortnite"), name: "Fortnite", imageURL: nil, liveCount: 1, viewers: nil)],
      nextCursor: nil
    )
  }
}

private struct AcceptsFollows: CategoryFollowing {
  func follow(_: CategorySlug) async throws {}
  func unfollow(_: CategorySlug) async throws {}
}

private struct NoTags: CategoryTagDirectory {
  func tags() async throws -> [InterestTag] {
    []
  }
}

private struct UndecidedNotifications: NotificationPermission {
  func authorization() async -> NotificationAuthorization {
    .notDetermined
  }

  func request() async -> Bool? {
    false
  }
}

@MainActor
private func makePreferences() -> PreferencesStore {
  PreferencesStore(repository: InMemoryPreferences(language: .english), onChange: { _ in })
}

@MainActor
@Suite("Fin du parcours de personnalisation (ADR 0051)")
struct PersonalizationFinishTests {
  @Test("terminer le parcours le marque terminé pour ce compte, puis ferme le parcours")
  func marksAccount() {
    let preferences = makePreferences()
    let recorder = CloseRecorder()
    let account = UUID()

    PersonalizationRoot.finish(account: account, preferences: preferences, close: recorder.close)

    #expect(preferences.hasCompletedOnboarding(account))
    #expect(!preferences.hasCompletedOnboarding(UUID()))
    #expect(recorder.closes == 1)
  }

  @Test("un compte toujours inconnu au récap ne bloque pas l'utilisateur : le parcours se ferme sans rien marquer")
  func unknownAccountStillCloses() {
    let preferences = makePreferences()
    let recorder = CloseRecorder()

    PersonalizationRoot.finish(account: nil, preferences: preferences, close: recorder.close)

    #expect(recorder.closes == 1)
  }

  @Test("chaque parcours repart de zéro : ce qu'un compte a suivi ne se coche pas pour le suivant")
  func freshChoicesPerJourney() async throws {
    let sources = PersonalizationSources(
      categories: OneCategory(),
      following: AcceptsFollows(),
      tags: NoTags(),
      notifications: UndecidedNotifications()
    )
    let preferences = makePreferences()
    let fortnite = try CategorySlug("fortnite")
    let first = sources.choices(preferences: preferences)
    await first.categories.load()
    await first.categories.toggle(fortnite)

    let next = sources.choices(preferences: preferences)

    #expect(first.categories.isFollowing(fortnite))
    #expect(!next.categories.isFollowing(fortnite))
    #expect(next.categories.selectionCount == 0)
    #expect(next.categories !== first.categories)
    #expect(next.interests !== first.interests)
    #expect(next.notifications !== first.notifications)
  }
}
