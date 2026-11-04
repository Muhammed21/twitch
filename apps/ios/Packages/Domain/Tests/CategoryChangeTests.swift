import Domain
import Foundation
import Testing

private let honorOfKings = ChannelCategory(
  id: CategoryID(UUID(uuidString: "1c9e4a52-7d3b-4f8e-a6b1-2d5c8e9f0a13") ?? UUID()),
  name: "Honor of Kings"
)
private let justChatting = ChannelCategory(
  id: CategoryID(UUID(uuidString: "7a2b3c4d-5e6f-4a1b-8c9d-0e1f2a3b4c5d") ?? UUID()),
  name: "Just Chatting"
)

@Suite("Changement de catégorie envoyé avec Edit Stream Info")
struct CategoryChangeTests {
  @Test("choisir une autre catégorie la pose, même sans catégorie avant")
  func setsAnotherCategory() {
    #expect(CategoryChange.from(honorOfKings, to: justChatting) == .set(justChatting.id))
    #expect(CategoryChange.from(nil, to: justChatting) == .set(justChatting.id))
  }

  @Test("retirer la catégorie de la chaîne la vide")
  func clearsCategory() {
    #expect(CategoryChange.from(honorOfKings, to: nil) == .clear)
  }

  @Test("garder la même catégorie, ou rester sans, ne l'envoie pas")
  func keepsCategory() {
    #expect(CategoryChange.from(honorOfKings, to: honorOfKings) == .keep)
    #expect(CategoryChange.from(nil, to: nil) == .keep)
  }
}
