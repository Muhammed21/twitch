import DesignSystem
import SwiftUI
import Testing

private let tagMeasures: [(LayoutRole, CGFloat)] = [
  (.categoryTagPaddingH, 8),
  (.categoryTagPaddingV, 3),
  (.categoryTagGap, 4),
]

private let headerMeasures: [(LayoutRole, CGFloat)] = [
  (.categoryHeaderCoverWidth, 72),
  (.categoryHeaderGap, 16),
  (.categoryHeaderLineGap, 4),
]

@Suite("En-tête d'une catégorie")
struct CategoryHeaderStyleTests {
  @Test("un tag reprend la pastille relevée sous une catégorie de Parcourir", arguments: tagMeasures)
  func tagLayout(role: LayoutRole, points: CGFloat) {
    #expect(role.points == points)
  }

  @Test("un tag est en caption semibold, gris sur fond gris clair, en pastille")
  func tagStyle() {
    #expect(TextRole.tag.font == Font.caption.weight(.semibold))
    #expect(CategoryTagStyle.foreground == .textSecondary)
    #expect(CategoryTagStyle.background == .surfaceSecondary)
  }

  @Test("l'en-tête place une pochette 3:4 à gauche du nom, sans capture de référence", arguments: headerMeasures)
  func headerLayout(role: LayoutRole, points: CGFloat) {
    #expect(role.points == points)
  }

  @Test("le nom est en titre, les viewers comme sous une tuile de Parcourir")
  func headerText() {
    #expect(CategoryHeaderStyle.name == .title)
    #expect(CategoryHeaderStyle.viewers == .meta)
    #expect(CategoryHeaderStyle.coverAspectRatio == CategoryTileStyle.coverAspectRatio)
  }
}
