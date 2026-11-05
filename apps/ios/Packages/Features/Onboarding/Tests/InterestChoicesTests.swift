import Domain
import Foundation
import Onboarding
import Preferences
import Testing

private struct Failure: Error {}

private struct FakeTags: CategoryTagDirectory {
  let reply: Result<[InterestTag], Failure>

  func tags() async throws -> [InterestTag] {
    try reply.get()
  }
}

@MainActor
private final class Changes {
  private(set) var all: [PreferenceChanged] = []

  func record(_ change: PreferenceChanged) {
    all.append(change)
  }
}

@MainActor
private func makePreferences(changes: Changes = Changes()) -> PreferencesStore {
  PreferencesStore(repository: InMemoryPreferences(language: .english), onChange: { changes.record($0) })
}

private let fps = InterestTag(name: "FPS", categoryCount: 3)
private let chill = InterestTag(name: "Chill", categoryCount: 2)

@MainActor
@Suite("Page 3 : centres d'intérêt par tags (ADR 0050, ADR 0051 §4)")
struct InterestChoicesTests {
  @Test("charge les tags dans l'ordre du serveur")
  func loads() async {
    let choices = InterestChoices(tags: FakeTags(reply: .success([fps, chill])), preferences: makePreferences())

    await choices.load()

    #expect(choices.state == .loaded([fps, chill]))
  }

  @Test("une liste de tags vide laisse passer la page")
  func emptyLetsThrough() async {
    let choices = InterestChoices(tags: FakeTags(reply: .success([])), preferences: makePreferences())

    await choices.load()

    #expect(choices.state == .empty)
    #expect(choices.selectionCount == 0)
  }

  @Test("un échec se dit, sans bloquer la page")
  func failure() async {
    let choices = InterestChoices(tags: FakeTags(reply: .failure(Failure())), preferences: makePreferences())

    await choices.load()

    #expect(choices.state == .failed)
  }

  @Test("les tags choisis sont enregistrés à la validation, en un seul preference:changed")
  func savesOnContinue() async {
    let changes = Changes()
    let preferences = makePreferences(changes: changes)
    let choices = InterestChoices(tags: FakeTags(reply: .success([fps, chill])), preferences: preferences)
    await choices.load()

    choices.toggle(fps)
    choices.toggle(chill)
    choices.toggle(chill)
    #expect(changes.all.isEmpty)
    choices.save()

    #expect(preferences.current.interests == ["FPS"])
    #expect(changes.all == [PreferenceChanged(preference: .interests, value: "FPS", source: .onboarding)])
    #expect(choices.selectionCount == 1)
  }

  @Test("les choix déjà enregistrés sur l'appareil sont repris")
  func startsFromSaved() {
    let preferences = makePreferences()
    preferences.update(.interests(["Chill"]), source: .settings)

    let choices = InterestChoices(tags: FakeTags(reply: .success([])), preferences: preferences)

    #expect(choices.isSelected(chill))
    #expect(!choices.isSelected(fps))
  }
}
