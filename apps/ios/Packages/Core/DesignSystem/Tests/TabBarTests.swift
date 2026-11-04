import DesignSystem
import Testing

@Suite("Barre d'onglets, relevée sur profil/menu-compte--defaut et accueil/flux-suivis--aucun-live")
struct TabBarTests {
  @Test("un onglet actif prend le glyphe plein, un onglet inactif le glyphe au trait")
  func glyphFollowsSelection() {
    let glyph = TabBarGlyph.symbol(outline: "house", filled: "house.fill")

    #expect(glyph.systemName(isSelected: true) == "house.fill")
    #expect(glyph.systemName(isSelected: false) == "house")
  }

  @Test("l'avatar n'a pas de glyphe système")
  func avatarHasNoSymbol() {
    #expect(TabBarGlyph.avatar.systemName(isSelected: true) == nil)
  }

  @Test("un onglet actif est violet, un onglet inactif prend la couleur du texte")
  func foregroundFollowsSelection() {
    #expect(TabBarGlyph.foreground(isSelected: true) == .navigationActive)
    #expect(TabBarGlyph.foreground(isSelected: false) == .textPrimary)
  }

  @Test("le bouton « + » est une pilule grise à glyphe de texte, comme sur profil/menu-compte--defaut")
  func createButtonColors() {
    #expect(TabBarCreateStyle.background == .surfaceSecondary)
    #expect(TabBarCreateStyle.foreground == .textPrimary)
  }
}
