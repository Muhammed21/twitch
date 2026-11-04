import DesignSystem
import Testing

@Suite("Carte de live, relevée sur parcourir/liste-chaines-live--defaut et --theme-sombre")
struct LiveCardTests {
  @Test("le badge LIVE est rouge à libellé blanc, les viewers en blanc sur le voile")
  func mediaOverlays() {
    #expect(LiveCardStyle.badgeBackground == .liveBadge)
    #expect(LiveCardStyle.badgeForeground == .onLiveBadge)
    #expect(LiveCardStyle.viewersBackground == .scrim)
    #expect(LiveCardStyle.viewersForeground == .onMedia)
  }

  @Test("le nom de la chaîne prend la couleur du texte, le titre et la catégorie la couleur secondaire")
  func infoColors() {
    #expect(LiveCardStyle.name == .textPrimary)
    #expect(LiveCardStyle.detail == .textSecondary)
  }

  @Test("sans miniature, la carte garde la place de l'image sur la surface secondaire")
  func thumbnailPlaceholder() {
    #expect(LiveCardStyle.placeholder == .surfaceSecondary)
  }
}
