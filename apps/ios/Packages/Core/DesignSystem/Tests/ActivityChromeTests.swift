import DesignSystem
import Testing

@Suite("Page Activité : en-tête et états vides (IMG_9612, IMG_9613)")
struct ActivityChromeTests {
  @Test("le titre est centré dans un en-tête de 32 pt, à la taille du titre du tableau de bord")
  func header() {
    #expect(LayoutRole.activityHeaderHeight.points == 32)
    #expect(TextRole.activityTitle.font == TextRole.display.font)
    #expect(ActivityStyle.title == .textPrimary)
  }

  @Test("l'état vide pose un titre gras et une aide en texte secondaire, centrés, à 40 pt des bords")
  func emptyText() {
    #expect(ActivityStyle.emptyForeground == .textSecondary)
    #expect(TextRole.activityEmptyTitle.font == TextRole.actionLabel.font)
    #expect(TextRole.activityEmptyMessage.font == TextRole.fieldText.font)
    #expect(LayoutRole.activityEmptyInset.points == 40)
    #expect(LayoutRole.activityEmptyGap.points == 16)
  }

  @Test("le bouton de l'état vide est une pilule violette de 36 pt de haut, libellé blanc à 12 pt des bords")
  func emptyAction() {
    #expect(ActivityStyle.actionBackground == .accent)
    #expect(ActivityStyle.actionForeground == .onAccent)
    #expect(TextRole.activityEmptyAction.font == TextRole.actionLabel.font)
    #expect(LayoutRole.activityActionHeight.points == 36)
    #expect(LayoutRole.activityActionPadding.points == 12)
  }
}
