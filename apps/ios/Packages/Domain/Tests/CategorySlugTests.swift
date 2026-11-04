import Domain
import Testing

@Suite("CategorySlug")
struct CategorySlugTests {
  @Test(
    "accepte des mots en minuscules et chiffres séparés par un tiret, jusqu'à 50 caractères",
    arguments: ["irl", "just-chatting", "call-of-duty-warzone", "gta5", String(repeating: "a", count: 50)]
  )
  func accepted(value: String) throws {
    #expect(try CategorySlug(value).rawValue == value)
  }

  @Test(
    "refuse ce qui sort de ^[a-z0-9]+(?:-[a-z0-9]+)*$ ou dépasse 50 caractères",
    arguments: ["", "Just Chatting", "just_chatting", "-irl", "irl-", "just--chatting", "jéu", String(repeating: "a", count: 51)]
  )
  func malformed(value: String) {
    #expect(throws: CategorySlugError.malformed) {
      try CategorySlug(value)
    }
  }
}
