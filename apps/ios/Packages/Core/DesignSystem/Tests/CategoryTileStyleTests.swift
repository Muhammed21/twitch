import DesignSystem
import SwiftUI
import Testing

private let tileMeasures: [(LayoutRole, CGFloat)] = [
  (.categoryTileDotGap, 8),
  (.categoryTileTagTop, 4),
]

@Suite("Tuile de catégorie : relevé sur docs/new-reference-ui/IMG_9610")
struct CategoryTileStyleTests {
  @Test("le point rouge est à 8 pt des viewers, le tag à 4 pt sous eux", arguments: tileMeasures)
  func layoutRoles(role: LayoutRole, points: CGFloat) {
    #expect(role.points == points)
  }

  @Test("les viewers d'une tuile sont en subheadline régulier")
  func viewersText() {
    #expect(TextRole.categoryViewers.font == Font.subheadline.weight(.regular))
  }
}
