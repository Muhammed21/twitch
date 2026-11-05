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
  (.followButtonHeight, 40),
  (.followButtonColumnGap, 16),
  (.followingButtonWidth, 84),
  (.followGlyphGap, 14),
  (.followingGlyphGap, 6),
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

  @Test("le bouton Follow reprend celui de la page de chaîne : violet avec un cœur vide, gris avec un cœur plein une fois suivi")
  func followButton() {
    #expect(CategoryFollowStyle.kind(isFollowing: false) == .primary)
    #expect(CategoryFollowStyle.kind(isFollowing: true) == .secondary)
    #expect(CategoryFollowStyle.glyph(isFollowing: false) == "heart")
    #expect(CategoryFollowStyle.glyph(isFollowing: true) == "heart.fill")
  }

  @Test("Follow est en headline semibold : « Follow » large de 48 pt, fût de 2 pt (chaine/page-chaine--toast-plus-suivi)")
  func followLabel() {
    #expect(TextRole.followLabel.font == Font.headline.weight(.semibold))
  }

  @Test("une fois suivi, le bouton gris porte un cœur plein et un chevron qui ouvre le menu")
  func followingButton() {
    #expect(CategoryFollowStyle.menuGlyph == "chevron.down")
  }

  @Test("le compteur de followers est en subheadline, comme sur la page de chaîne")
  func followers() {
    #expect(TextRole.followerCount.font == Font.subheadline.weight(.regular))
    #expect(CategoryFollowStyle.followers == .textPrimary)
  }
}
