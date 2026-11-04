import Domain
import Foundation
import Testing

@Suite("En-tête d'une catégorie ouverte depuis Parcourir")
struct CategoryHeadingTests {
  @Test("la tuile touchée donne le nom, la pochette et les viewers, sans tags en attendant le contrat")
  func fromBrowseTile() throws {
    let cover = try #require(URL(string: "https://cdn.example/just-chatting.jpg"))
    let tile = try BrowseCategory(
      slug: CategorySlug("just-chatting"),
      name: "Just Chatting",
      imageURL: cover,
      liveCount: 12,
      viewers: ViewerCount(184_000)
    )

    let heading = CategoryHeading(tile)

    #expect(try heading.slug == CategorySlug("just-chatting"))
    #expect(heading.name == "Just Chatting")
    #expect(heading.imageURL == cover)
    #expect(try heading.viewers == ViewerCount(184_000))
    #expect(heading.tags.isEmpty)
  }
}
