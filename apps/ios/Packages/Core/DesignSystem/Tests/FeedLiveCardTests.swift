import DesignSystem
import SwiftUI
import Testing

private let feedMeasures: [(LayoutRole, CGFloat)] = [
  (.feedBadgeInset, 12),
  (.feedBadgePaddingH, 6),
  (.feedBadgeDotGap, 4),
  (.feedViewersInset, 10),
  (.feedViewersPaddingH, 5),
  (.feedViewersRadius, 4),
  (.feedOverlayPaddingV, 1),
  (.feedInfoInset, 10),
  (.feedInfoTop, 8),
  (.feedAvatarSize, 32),
  (.feedAvatarGap, 8),
  (.feedTitleTop, 8),
  (.feedDividerTop, 20),
  (.feedDividerWidth, 63),
  (.feedDividerHeight, 2),
  (.feedDividerBottom, 20),
  (.filterChipsTop, 12),
  (.filterChipsBottom, 24),
]

@Suite("Flux de lives de l'accueil : relevé sur docs/new-reference-ui/IMG_9607")
struct FeedLiveCardTests {
  @Test("les mesures du flux, de la rangée de filtres et des étiquettes posées sur la vidéo", arguments: feedMeasures)
  func layoutRoles(role: LayoutRole, points: CGFloat) {
    #expect(role.points == points)
  }

  @Test("« Live » et les spectateurs en footnote régulier, le pseudo en headline semibold, le titre en subheadline")
  func textRoles() {
    #expect(TextRole.feedOverlay.font == Font.footnote.weight(.regular))
    #expect(TextRole.feedChannelName.font == Font.headline.weight(.semibold))
    #expect(TextRole.feedTitle.font == Font.subheadline.weight(.regular))
  }

  @Test("« Live » sur une pilule voilée avec un point rouge, les spectateurs en blanc sur le voile")
  func overlayColors() {
    #expect(FeedLiveCardStyle.badgeBackground == .scrim)
    #expect(FeedLiveCardStyle.badgeDot == .liveIndicator)
    #expect(FeedLiveCardStyle.viewersBackground == .scrim)
    #expect(FeedLiveCardStyle.overlayForeground == .onMedia)
  }

  @Test("le pseudo et le titre en texte principal sur deux lignes au plus, le filet en surface secondaire")
  func infoColors() {
    #expect(FeedLiveCardStyle.name == .textPrimary)
    #expect(FeedLiveCardStyle.title == .textPrimary)
    #expect(FeedLiveCardStyle.titleLineLimit == 2)
    #expect(FeedLiveCardStyle.divider == .surfaceSecondary)
    #expect(FeedLiveCardStyle.placeholder == .surfaceSecondary)
  }
}
