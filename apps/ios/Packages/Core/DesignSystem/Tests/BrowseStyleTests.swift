import DesignSystem
import SwiftUI
import Testing

private let browseMeasures: [(LayoutRole, CGFloat)] = [
  (.browseTabGap, 32),
  (.browseTabIndicatorHeight, 2),
  (.browseTabIndicatorGap, 8),
  (.categoryGridGap, 8),
  (.categoryRowGap, 16),
  (.categoryNameTop, 4),
  (.liveDotSize, 8),
  (.liveDotGap, 6),
]

@Suite("Browse : styles relevés sur parcourir/liste-categories--defaut")
struct BrowseStyleTests {
  @Test("les mesures des onglets et de la grille des catégories", arguments: browseMeasures)
  func layoutRoles(role: LayoutRole, points: CGFloat) {
    #expect(role.points == points)
  }

  @Test("les onglets et le nom d'une catégorie sont en headline semibold, les viewers en footnote régulier")
  func textRoles() {
    #expect(TextRole.display.font == Font.headline.weight(.semibold))
    #expect(TextRole.meta.font == Font.footnote.weight(.regular))
  }

  @Test("une pochette de catégorie est en 3:4")
  func coverAspectRatio() {
    #expect(CategoryTileStyle.coverAspectRatio == 0.75)
  }

  @Test("l'onglet actif est violet et souligné, l'autre en texte principal")
  func tabColors() {
    #expect(BrowseTabsStyle.foreground(isSelected: true) == .navigationActive)
    #expect(BrowseTabsStyle.foreground(isSelected: false) == .textPrimary)
    #expect(BrowseTabsStyle.indicator == .navigationActive)
  }

  @Test("le point rouge des viewers, les viewers en texte secondaire, la pochette absente en surface secondaire")
  func tileColors() {
    #expect(CategoryTileStyle.liveDot == .liveIndicator)
    #expect(CategoryTileStyle.viewers == .textSecondary)
    #expect(CategoryTileStyle.coverPlaceholder == .surfaceSecondary)
  }
}
