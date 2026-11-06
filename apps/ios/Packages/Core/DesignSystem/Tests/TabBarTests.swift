import DesignSystem
import Testing

@Suite("Barre d'onglets, relevée sur profil/menu-compte--defaut et accueil/flux-suivis--aucun-live")
struct TabBarTests {
  @Test("un onglet actif est violet, un onglet inactif prend la couleur du texte")
  func foregroundFollowsSelection() {
    #expect(TabBarGlyph.foreground(isSelected: true) == .navigationActive)
    #expect(TabBarGlyph.foreground(isSelected: false) == .textPrimary)
  }

  @Test("en mode spectateur, le bouton « + » est une pilule grise à glyphe de texte (IMG_9610)")
  func createButtonColors() {
    #expect(TabBarCreateStyle.neutral.background == .surfaceSecondary)
    #expect(TabBarCreateStyle.neutral.foreground == .textPrimary)
  }

  @Test("en mode créateur, le bouton « + » est une pilule violette à glyphe blanc (IMG_9624)")
  func creatorCreateButtonColors() {
    #expect(TabBarCreateStyle.accent.background == .accent)
    #expect(TabBarCreateStyle.accent.foreground == .onAccent)
  }

  @Test("l'onglet Activité porte la cloche : au trait inactif (IMG_9607), pleine active (IMG_9612)")
  func activityBell() {
    let glyph = ViewerTabGlyphs.activity

    #expect(glyph.mask(isSelected: false) == .bellOutline)
    #expect(glyph.mask(isSelected: true) == .bellFilled)
  }
}
