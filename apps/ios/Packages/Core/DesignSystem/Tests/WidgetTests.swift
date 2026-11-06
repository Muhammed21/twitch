import DesignSystem
import DesignTokens
import Testing

@Suite("Gestionnaire de stream à widgets, relevé sur IMG_9618")
struct WidgetTests {
  @Test("l'écran est blanc ; une carte a un en-tête gris clair, un corps blanc et un filet de 1 pt aux coins de 6 pt")
  func cardColors() {
    #expect(StreamManagerStyle.background == .surface)
    #expect(WidgetStyle.header == .widgetHeader)
    #expect(WidgetStyle.body == .surface)
    #expect(WidgetStyle.border == .widgetBorder)
    #expect(LayoutRole.widgetBorderWidth.points == 1)
    #expect(LayoutRole.widgetRadius.points == Radius.lg)
  }

  @Test("la carte est à 20 pt des bords et 8 pt sous l'en-tête ; son en-tête de 35 pt porte le titre et « ⋮ » à 8 pt des bords")
  func cardLayout() {
    #expect(LayoutRole.widgetInset.points == 20)
    #expect(LayoutRole.widgetGap.points == 8)
    #expect(LayoutRole.widgetHeaderHeight.points == 35)
    #expect(LayoutRole.widgetHeaderPadding.points == 8)
    #expect(TextRole.widgetTitle.font == TextRole.liveBadge.font)
    #expect(WidgetStyle.menuGlyph == .widgetMenu)
  }

  @Test("le dock montre des pilules grises ; celle du widget affiché, de 57 × 40 pt, est cerclée de 2 pt à 2 pt de distance")
  func dock() {
    #expect(WidgetStyle.dockButton == .surfaceTertiary)
    #expect(WidgetStyle.dockRing == .textPrimary)
    #expect(LayoutRole.dockButtonWidth.points == 57)
    #expect(LayoutRole.dockButtonHeight.points == 40)
    #expect(LayoutRole.dockRingWidth.points == 2)
    #expect(LayoutRole.dockRingGap.points == 2)
    #expect(LayoutRole.dockInset.points == 8)
    #expect(LayoutRole.dockTop.points == 4)
    #expect(WidgetStyle.chatGlyph == .widgetChat)
  }

  @Test("l'en-tête : croix, caméra rouge, titre gras, badge noir « HORS LIGNE », avatar de 26 pt, filet dessous")
  func header() {
    #expect(StreamManagerStyle.closeGlyph == .closeCross)
    #expect(StreamManagerStyle.cameraGlyph == .streamCamera)
    #expect(StreamManagerStyle.camera == .streamManagerCamera)
    #expect(StreamManagerStyle.offlineBadge == .mediaBackground)
    #expect(StreamManagerStyle.offlineLabel == .onMedia)
    #expect(StreamManagerStyle.divider == .streamManagerDivider)
    #expect(TextRole.streamManagerTitle.font == TextRole.actionLabel.font)
    #expect(LayoutRole.streamManagerHeaderHeight.points == 32)
    #expect(LayoutRole.streamManagerHeaderBottom.points == 6)
    #expect(LayoutRole.streamManagerTitleGap.points == 3)
    #expect(LayoutRole.streamManagerItemGap.points == 8)
    #expect(LayoutRole.streamManagerAvatarSize.points == 26)
  }

  @Test("le champ du chat est blanc, cerclé de gris sur 1 pt, de 44 pt de haut, aux coins de 4 pt, avec les émoticônes à droite")
  func chatField() {
    #expect(WidgetChatFieldStyle.background == .surface)
    #expect(WidgetChatFieldStyle.border == .widgetFieldBorder)
    #expect(WidgetChatFieldStyle.emoteGlyph == .emote)
    #expect(LayoutRole.widgetFieldHeight.points == 44)
    #expect(LayoutRole.widgetFieldRadius.points == Radius.md)
    #expect(LayoutRole.widgetFieldBorderWidth.points == 1)
    #expect(LayoutRole.widgetFieldInset.points == 8)
  }
}
