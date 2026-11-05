import DesignSystem
import DesignTokens
import SwiftUI
import Testing

@Suite("Cartes de l'accueil du tableau de bord des créateurs (IMG_9624)")
struct DashboardHomeCardsTests {
  @Test("les cartes sont grises, aux coins de 10 pt, à 22 pt sous l'en-tête puis espacées de 16 pt")
  func cards() {
    #expect(DashboardStyle.cardBackground == .surfaceTertiary)
    #expect(LayoutRole.dashboardCardRadius.points == Radius.sheet)
    #expect(LayoutRole.dashboardCardsTop.points == 22)
    #expect(LayoutRole.dashboardCardGap.points == 16)
  }

  @Test("la carte de chiffres fait 78 pt de haut, trois colonnes égales à 12 pt des bords, libellé à 4 pt du chiffre")
  func statsCard() {
    #expect(LayoutRole.dashboardStatsHeight.points == 78)
    #expect(LayoutRole.dashboardStatsInset.points == 12)
    #expect(LayoutRole.dashboardStatGap.points == 4)
    #expect(DashboardStyle.statValue == .textPrimary)
    #expect(DashboardStyle.statLabel == .textSecondary)
    #expect(TextRole.dashboardStatValue.font == TextRole.display.font)
    #expect(TextRole.dashboardStatLabel.font == TextRole.fieldHint.font)
  }

  @Test("l'aperçu hors ligne est noir, 16:9, aux coins de 6 pt, HORS LIGNE en blanc à 12 pt du bord et du haut")
  func offlinePreview() {
    #expect(DashboardStyle.previewBackground == .mediaBackground)
    #expect(DashboardStyle.previewLabel == .onMedia)
    #expect(LayoutRole.dashboardPreviewRadius.points == Radius.lg)
    #expect(LayoutRole.dashboardPreviewLabelLeading.points == 12)
    #expect(LayoutRole.dashboardPreviewLabelTop.points == 12)
    #expect(TextRole.dashboardPreviewLabel.font == TextRole.tag.font)
    #expect(abs(DashboardStyle.previewAspectRatio * 9 - 16) < 0.000_1)
  }

  @Test("les boutons de la carte de stream sont des capsules de 36 pt, violette puis grise, à 8 pt l'une de l'autre")
  func streamButtons() {
    #expect(LayoutRole.dashboardStreamPadding.points == 16)
    #expect(LayoutRole.dashboardStreamButtonHeight.points == 36)
    #expect(LayoutRole.dashboardStreamGap.points == 8)
    #expect(DashboardStyle.primaryButton == .accent)
    #expect(DashboardStyle.onPrimaryButton == .onAccent)
    #expect(DashboardStyle.secondaryButton == .surfaceRaised)
    #expect(DashboardStyle.onSecondaryButton == .textPrimary)
    #expect(TextRole.dashboardStreamButton.font == Font.cardAction)
  }

  @Test("le texte d'aide est à 22 pt des bords, 8 pt sous la carte de stream")
  func hint() {
    #expect(LayoutRole.dashboardHintInset.points == 22)
    #expect(LayoutRole.dashboardHintTop.points == 8)
    #expect(DashboardStyle.hint == .textPrimary)
    #expect(TextRole.dashboardHint.font == TextRole.fieldHint.font)
  }

  @Test("la carte d'activité fait 132 pt, message centré en texte secondaire ; le lien violet suit à 16 pt")
  func activity() {
    #expect(LayoutRole.dashboardActivityHeight.points == 132)
    #expect(DashboardStyle.activityEmpty == .textSecondary)
    #expect(TextRole.dashboardActivityEmpty.font == TextRole.viewerCount.font)
    #expect(DashboardStyle.link == .link)
    #expect(TextRole.dashboardLink.font == Font.cardAction)
  }
}
