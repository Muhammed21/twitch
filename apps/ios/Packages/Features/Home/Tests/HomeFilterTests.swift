import Domain
import Foundation
import Home
import Testing

private func category(_ slug: String, name: String) throws -> BrowseCategory {
  try BrowseCategory(slug: CategorySlug(slug), name: name, imageURL: nil, liveCount: 1, viewers: nil)
}

@Suite("Puces de filtre du flux de l'accueil, relevées sur docs/new-reference-ui/IMG_9607")
struct HomeFilterTests {
  @Test("« Tout » ouvre la rangée, puis les catégories en live dans l'ordre de Parcourir")
  func chipsOrder() throws {
    let chips = try HomeFilter.chips(for: [
      category("fortnite", name: "Fortnite"),
      category("just-chatting", name: "Discussions"),
    ])

    #expect(try chips.map(\.value) == [.all, .category(CategorySlug("fortnite")), .category(CategorySlug("just-chatting"))])
    #expect(chips.map(\.title) == [shown(english: "All", french: "Tout"), "Fortnite", "Discussions"])
    #expect(chips.map(\.accessibilityIdentifier) == ["home.filter.all", "home.filter.fortnite", "home.filter.just-chatting"])
  }

  @Test("sans catégorie chargée, il reste « Tout »")
  func onlyAll() {
    #expect(HomeFilter.chips(for: []).map(\.value) == [.all])
  }

  @Test("le flux part sur « Tout »")
  func initialFilter() {
    #expect(HomeFilter.initial == .all)
  }

  @Test("une catégorie donne son slug pour charger ses lives, « Tout » n'en a pas")
  func categorySlug() throws {
    #expect(try HomeFilter.category(CategorySlug("fortnite")).category == CategorySlug("fortnite"))
    #expect(HomeFilter.all.category == nil)
  }

  @Test("le badge du flux dit « Live », comme sur IMG_9607")
  func feedBadge() {
    #expect(HomeCardText.feedBadge == "Live")
  }
}
