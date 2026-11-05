import Domain
import Testing

@Suite("Suivi d'une catégorie : état et compteur")
struct CategoryFollowTests {
  @Test("suivre ajoute un follower, ne plus suivre en retire un")
  func toggles() {
    let state = FollowState(isFollowing: false, followers: 41)

    #expect(state.toggled() == FollowState(isFollowing: true, followers: 42))
    #expect(state.toggled().toggled() == state)
  }

  @Test("le compteur ne descend pas sous zéro, même en retard sur l'écriture")
  func neverNegative() {
    let state = FollowState(isFollowing: true, followers: 0)

    #expect(state.toggled() == FollowState(isFollowing: false, followers: 0))
  }
}
