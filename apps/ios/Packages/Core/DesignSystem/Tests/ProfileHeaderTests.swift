import DesignSystem
import SwiftUI
import Testing

private let headerMeasures: [(LayoutRole, CGFloat)] = [
  (.profileBannerHeight, 70),
  (.profileAvatarSize, 88),
  (.profileAvatarOverlap, 16),
  (.profileAvatarGlyphInset, 20),
  (.profileAvatarGap, 8),
  (.profileNameTop, 8),
  (.profileBioTop, 20),
  (.profileHeaderBottom, 20),
  (.profileBannerControlSize, 40),
  (.profileBannerControlCenter, 16),
  (.profileBannerGlyph, 22),
  (.profileEditHeight, 30),
  (.profileEditPadding, 12),
  (.profileActionHeight, 50),
  (.profileActionGap, 8),
  (.profileActionRowGap, 16),
  (.profileActionGlyph, 24),
  (.profileActionGlyphGap, 12),
]

@Suite("En-tête du profil relevé sur docs/new-reference-ui/IMG_9614 à IMG_9617 et profil/menu-compte--theme-sombre")
struct ProfileHeaderTests {
  @Test("les mesures de la bannière, de l'avatar et des textes", arguments: headerMeasures)
  func layoutRoles(role: LayoutRole, points: CGFloat) {
    #expect(role.points == points)
  }

  @Test("la bannière vide est noire dans les deux thèmes, le pseudo en title2 gras, le dernier live et la bio en body")
  func styles() {
    #expect(ProfileHeaderStyle.banner == .mediaBackground)
    #expect(ProfileHeaderStyle.name == .textPrimary)
    #expect(ProfileHeaderStyle.lastLive == .textPrimary)
    #expect(ProfileHeaderStyle.bio == .textSecondary)
    #expect(TextRole.title.font == Font.title2.weight(.bold))
    #expect(TextRole.profileDetail.font == Font.body.weight(.regular))
  }

  @Test("roue de réglages et « Modifier le profil » blancs sur un voile sombre posé sur la bannière (IMG_9614)")
  func bannerControls() {
    #expect(ProfileHeaderStyle.bannerControl == .scrim)
    #expect(ProfileHeaderStyle.onBannerControl == .onMedia)
  }

  @Test("« Gestionnaire de stream », « Statistiques » et « Essayer sans publicité » : pilules grises, libellé en subheadline semibold (IMG_9614)")
  func actions() {
    #expect(ProfileHeaderStyle.action == .surfaceSecondary)
    #expect(ProfileHeaderStyle.onAction == .textPrimary)
    #expect(TextRole.profileAction.font == Font.subheadline.weight(.semibold))
  }
}
