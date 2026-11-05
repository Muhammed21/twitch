import DesignSystem
import DesignTokens
import Testing

@Suite("En-têtes, champ de recherche et états vides du tableau de bord des créateurs (IMG_9624 à IMG_9626)")
struct DashboardChromeTests {
  @Test("l'en-tête pose l'avatar de 30 pt à 16 pt du bord, le titre centré, sur 32 pt de haut")
  func header() {
    #expect(LayoutRole.dashboardHeaderHeight.points == 32)
    #expect(LayoutRole.dashboardAvatarSize.points == 30)
    #expect(LayoutRole.screenInset.points == 16)
    #expect(TextRole.dashboardTitle.font == TextRole.display.font)
  }

  @Test("les icônes de l'en-tête ont une zone de 44 pt, espacées de 10 pt ; le calendrier est grisé")
  func headerIcons() {
    #expect(LayoutRole.dashboardIconTarget.points == 44)
    #expect(LayoutRole.dashboardIconGap.points == 10)
    #expect(LayoutRole.dashboardIconOverhang.points == 10)
    #expect(DashboardStyle.iconForeground(isEnabled: true) == .textPrimary)
    #expect(DashboardStyle.iconForeground(isEnabled: false) == .iconDisabled)
  }

  @Test("Regarder est une pilule grise de 40 pt de haut, l'œil à 10 pt du bord et à 10 pt du libellé")
  func watchPill() {
    #expect(DashboardStyle.pillBackground == .surfaceSecondary)
    #expect(DashboardStyle.watchGlyph == .watchEye)
    #expect(LayoutRole.dashboardPillHeight.points == 40)
    #expect(LayoutRole.dashboardPillLeading.points == 10)
    #expect(LayoutRole.dashboardPillTrailing.points == 12)
  }

  @Test("le champ Rechercher est gris, de 40 pt de haut, aux coins de 8 pt, avec la loupe en texte secondaire")
  func searchField() {
    #expect(DashboardStyle.fieldBackground == .surfaceSecondary)
    #expect(DashboardStyle.fieldGlyph == .textSecondary)
    #expect(LayoutRole.dashboardFieldHeight.points == 40)
    #expect(LayoutRole.dashboardFieldRadius.points == Radius.xl)
    #expect(LayoutRole.dashboardFieldTop.points == 6)
  }

  @Test("le message d'un écran vide est centré, en texte principal, sur 256 pt de large au plus, à 256 pt sous l'en-tête")
  func emptyState() {
    #expect(DashboardStyle.emptyForeground == .textPrimary)
    #expect(TextRole.dashboardEmpty.font == TextRole.display.font)
    #expect(LayoutRole.dashboardEmptyTop.points == 256)
    #expect(LayoutRole.dashboardEmptyWidth.points == 256)
  }

  @Test("Contenu et Statistiques prennent leur glyphe au trait, plein quand l'onglet est actif ; Chaîne la silhouette")
  func tabGlyphs() {
    #expect(DashboardTabGlyphs.content == .mask(outline: .contentOutline, filled: .contentFilled))
    #expect(DashboardTabGlyphs.stats == .mask(outline: .statsOutline, filled: .statsFilled))
    #expect(DashboardTabGlyphs.channel == .mask(outline: .channelOutline, filled: .channelOutline))
  }
}
