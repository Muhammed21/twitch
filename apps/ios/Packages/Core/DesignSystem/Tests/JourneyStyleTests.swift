import DesignSystem
import SwiftUI
import Testing

private let journeyMeasures: [(LayoutRole, CGFloat)] = [
  (.journeyHeaderHeight, 44),
  (.journeyHeaderGap, 16),
  (.journeyControlSize, 24),
  (.journeyProgressHeight, 4),
  (.journeyMessageGap, 8),
  (.journeyContentGap, 24),
  (.journeyHeroWidth, 88),
  (.journeyChoiceCoverWidth, 47),
  (.journeyChoicePadding, 10),
  (.journeyChipPaddingH, 16),
  (.journeyChipPaddingV, 8),
  (.journeyChipGap, 8),
]

@Suite("Parcours de personnalisation : en-tête, progression et pages")
struct JourneyStyleTests {
  @Test("les mesures du parcours passent par les tokens d'espacement", arguments: journeyMeasures)
  func measures(role: LayoutRole, points: CGFloat) {
    #expect(role.points == points)
  }

  @Test("le titre d'une page reprend celui de onboarding/permission-notifications--defaut, le message le texte d'explication")
  func texts() {
    #expect(TextRole.journeyTitle.font == .titleText)
    #expect(TextRole.journeyMessage.font == .supportingText)
    #expect(TextRole.journeyControl.font == .actionLabel)
  }

  @Test("la progression se remplit en violet sur le gris des surfaces, « Skip » est un lien violet comme « Remind me later »")
  func colors() {
    #expect(JourneyStyle.progressFill == .accent)
    #expect(JourneyStyle.progressTrack == .surfaceSecondary)
    #expect(JourneyStyle.skip == .link)
    #expect(JourneyStyle.title == .textPrimary)
    #expect(JourneyStyle.message == .textSecondary)
    #expect(JourneyStyle.mark == .accent)
  }

  @Test("la barre ne déborde jamais : une progression hors de 0…1 est bornée")
  func clampedProgress() {
    #expect(JourneyProgressBar.filledFraction(-0.5) == 0)
    #expect(JourneyProgressBar.filledFraction(0.4) == 0.4)
    #expect(JourneyProgressBar.filledFraction(1.5) == 1)
  }

  @Test("une catégorie se choisit dans une carte de réglages, comme parametres/recommandations-categories--defaut")
  func choiceColors() {
    #expect(JourneyStyle.card == .surface)
    #expect(JourneyStyle.choiceName == .textPrimary)
    #expect(JourneyStyle.choiceDetail == .textSecondary)
    #expect(JourneyStyle.choiceDivider == .border)
    #expect(JourneyStyle.selected == .accent)
    #expect(JourneyStyle.unselected == .textSecondary)
    #expect(TextRole.journeyChoiceName.font == .actionLabel)
    #expect(TextRole.journeyChoiceDetail.font == .supportingText)
  }

  @Test("une catégorie suivie se coche, une catégorie libre propose de l'ajouter")
  func choiceSymbol() {
    #expect(CategoryChoiceRow.symbol(isSelected: true) == "checkmark.circle.fill")
    #expect(CategoryChoiceRow.symbol(isSelected: false) == "plus.circle")
  }

  @Test("un centre d'intérêt choisi passe en violet, son nom en blanc sur violet")
  func chipColors() {
    #expect(JourneyStyle.chip == .surface)
    #expect(JourneyStyle.chipLabel == .textPrimary)
    #expect(JourneyStyle.chipSelected == .accent)
    #expect(JourneyStyle.chipSelectedLabel == .onAccent)
  }

  @Test("les étiquettes se rangent ligne par ligne et passent à la ligne quand la largeur manque")
  func flowWraps() {
    let sizes = [CGSize(width: 40, height: 20), CGSize(width: 50, height: 20), CGSize(width: 30, height: 24)]

    let frames = JourneyFlow.frames(of: sizes, width: 100, spacing: 8)

    #expect(frames == [
      CGRect(x: 0, y: 0, width: 40, height: 20),
      CGRect(x: 48, y: 0, width: 50, height: 20),
      CGRect(x: 0, y: 28, width: 30, height: 24),
    ])
  }

  @Test("une étiquette plus large que la ligne garde sa propre ligne")
  func flowOversized() {
    let frames = JourneyFlow.frames(of: [CGSize(width: 140, height: 20), CGSize(width: 10, height: 20)], width: 100, spacing: 8)

    #expect(frames == [CGRect(x: 0, y: 0, width: 140, height: 20), CGRect(x: 0, y: 28, width: 10, height: 20)])
  }

  @Test("la hauteur du nuage est celle de sa dernière ligne")
  func flowSize() {
    let sizes = [CGSize(width: 60, height: 20), CGSize(width: 60, height: 30)]

    #expect(JourneyFlow.size(of: sizes, width: 100, spacing: 8) == CGSize(width: 100, height: 58))
    #expect(JourneyFlow.size(of: [], width: 100, spacing: 8) == CGSize(width: 100, height: 0))
  }
}
