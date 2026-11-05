import Domain
import Testing

@Suite("En-tête d'une catégorie : followers et suivi du compte")
struct CategoryDetailTests {
  @Test("connecté, l'en-tête donne l'état de suivi et le compteur")
  func signedIn() {
    let detail = CategoryDetail(tags: ["IRL"], followers: 41, isFollowing: true)

    #expect(detail.follow == FollowState(isFollowing: true, followers: 41))
  }

  @Test("sans compte, l'en-tête n'a pas d'état de suivi")
  func signedOut() {
    let detail = CategoryDetail(tags: [], followers: 41, isFollowing: nil)

    #expect(detail.follow == nil)
  }
}
