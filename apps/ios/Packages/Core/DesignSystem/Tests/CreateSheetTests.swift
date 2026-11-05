import DesignSystem
import DesignTokens
import SwiftUI
import Testing

@Suite("Feuille d'actions du bouton « + » et écran de passage (IMG_9611, IMG_9623, IMG_9627, IMG_9630)")
struct CreateSheetTests {
  @Test("le bouton Streaming est violet, son texte et son glyphe blancs")
  func streamingColors() {
    #expect(CreateSheetStyle.heroBackground == .accent)
    #expect(CreateSheetStyle.heroForeground == .onAccent)
    #expect(CreateSheetStyle.heroGlyph == .broadcast)
  }

  @Test("les lignes sont des cartes blanches sur le fond clair de la feuille, au texte principal")
  func rowColors() {
    #expect(CreateSheetStyle.background == .background)
    #expect(CreateSheetStyle.rowBackground == .surface)
    #expect(CreateSheetStyle.rowForeground == .textPrimary)
  }

  @Test("une ligne indisponible est la même carte à demi-opacité : blanc 251 et texte 132 sur le fond 247 de la capture")
  func disabledRow() {
    #expect(CreateSheetStyle.opacity(isEnabled: false) == 0.5)
    #expect(CreateSheetStyle.opacity(isEnabled: true) == 1)
  }

  @Test("le titre d'une ligne tient sur une ligne, comme sur la capture, quitte à se resserrer")
  func singleLineTitle() {
    #expect(CreateSheetStyle.titleMinimumScale == 0.85)
  }

  @Test("la ligne qui quitte le tableau de bord porte le glyphe de sortie de la capture")
  func leaveGlyph() {
    #expect(CreateSheetStyle.leaveGlyph == .leaveDashboard)
  }

  @Test("les cartes sont à 16 pt des bords, espacées de 8 pt, aux coins de 6 pt ; la feuille a des coins de 10 pt")
  func layout() {
    #expect(LayoutRole.sheetInset.points == 16)
    #expect(LayoutRole.sheetCardGap.points == 8)
    #expect(LayoutRole.sheetCardRadius.points == Radius.lg)
    #expect(LayoutRole.sheetRadius.points == 10)
    #expect(LayoutRole.sheetCancelHeight.points == 40)
    #expect(LayoutRole.sheetRowLineGap.points == 4)
  }

  @Test("l'écran de passage pose le Glitch sombre de 32 pt de haut au-dessus du titre, sur le fond clair")
  func transition() {
    #expect(ModeTransitionStyle.background == .background)
    #expect(ModeTransitionStyle.glitch == .textPrimary)
    #expect(LayoutRole.transitionGlitchHeight.points == 32)
    #expect(LayoutRole.transitionTitleGap.points == 20)
  }
}
