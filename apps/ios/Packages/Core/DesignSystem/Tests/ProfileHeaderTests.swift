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
  (.profileHeaderBottom, 16),
]

@Suite("En-tête du profil relevé sur profil/menu-compte--defaut et --theme-sombre")
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
}
