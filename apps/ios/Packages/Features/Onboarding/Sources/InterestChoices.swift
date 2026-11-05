import Domain
import Foundation
import Observation
import Preferences

@MainActor
@Observable
public final class InterestChoices {
  public private(set) var state = ChoicesState<InterestTag>.loading
  private var selected: Set<String>

  private let tags: any CategoryTagDirectory
  private let preferences: PreferencesStore

  public init(tags: any CategoryTagDirectory, preferences: PreferencesStore) {
    self.tags = tags
    self.preferences = preferences
    selected = preferences.current.interests
  }

  public var selectionCount: Int {
    selected.count
  }

  public func isSelected(_ tag: InterestTag) -> Bool {
    selected.contains(tag.name)
  }

  public func load() async {
    state = .loading
    do {
      let loaded = try await tags.tags()
      state = loaded.isEmpty ? .empty : .loaded(loaded)
    } catch {
      state = .failed
    }
  }

  public func toggle(_ tag: InterestTag) {
    selected = selected.contains(tag.name) ? selected.subtracting([tag.name]) : selected.union([tag.name])
  }

  public func save() {
    preferences.update(.interests(selected), source: .onboarding)
  }
}
