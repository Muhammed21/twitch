import Domain
import Foundation
@testable import Home
import Testing

@Suite("Browse : libellés (parcourir/liste-categories--defaut)")
struct BrowseTextTests {
  @Test(
    "les viewers d'une catégorie s'affichent en notation compacte",
    arguments: [(184_000, "184K"), (96000, "96K"), (1_200_000, "1.2M"), (950, "950"), (0, "0")]
  )
  func compactViewers(count: Int, expected: String) throws {
    #expect(try BrowseText.viewers(ViewerCount(count), locale: Locale(identifier: "en_US")) == expected)
  }

  @Test("sans nombre de viewers, la catégorie n'affiche pas de ligne de viewers")
  func unknownViewers() {
    #expect(BrowseText.viewers(nil, locale: Locale(identifier: "en_US")) == nil)
  }

  @Test("les onglets reprennent les libellés de la capture, Categories en premier")
  func tabs() {
    #expect(BrowseTab.allCases == [.categories, .liveChannels])
    #expect(BrowseTab.categories.title == shown(english: "Categories", french: "Catégories"))
    #expect(BrowseTab.liveChannels.title == shown(english: "Live Channels", french: "Chaînes live"))
    #expect(BrowseText.tabTitle == shown(english: "Browse", french: "Parcourir"))
  }

  @Test("Browse s'ouvre sur l'onglet Categories")
  func defaultTab() {
    #expect(BrowseTab.initial == .categories)
  }
}
