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
}
