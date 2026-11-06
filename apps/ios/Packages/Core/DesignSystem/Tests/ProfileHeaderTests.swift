@testable import DesignSystem
import Foundation
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
  (.profileTabTop, 20),
  (.profileAboutTop, 55),
  (.profileAboutIllustrationGap, 16),
  (.profileAboutTextGap, 16),
  (.profileAboutInset, 40),
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

  @Test("la bannière et l'avatar montrent l'image de l'utilisateur une fois chargée (IMG_9615)")
  func loadedPicture() {
    let image = Image(systemName: "person")

    #expect(ProfilePicture.loaded(.success(image)) == image)
  }

  @Test("pendant le chargement, sans image ou en échec, la bannière noire et l'avatar par défaut restent")
  func fallbackPicture() {
    #expect(ProfilePicture.loaded(.empty) == nil)
    #expect(ProfilePicture.loaded(.failure(URLError(.badServerResponse))) == nil)
  }

  @Test("« À propos » vide : titre en headline gras et texte en body, tous deux en texte secondaire (IMG_9615)")
  func aboutEmptyState() {
    #expect(ProfileHeaderStyle.aboutTitle == .textSecondary)
    #expect(ProfileHeaderStyle.aboutMessage == .textSecondary)
    #expect(TextRole.profileAboutTitle.font == Font.headline.weight(.bold))
    #expect(TextRole.profileAboutMessage.font == Font.body.weight(.regular))
  }

  @Test("« À propos » vide : le personnage sur losange violet, 55 pt sous les onglets et 16 pt au-dessus du titre (IMG_9615)")
  func aboutEmptyIllustration() {
    #expect(ProfileAboutEmpty.illustration == .characterOnPurple)
    #expect(LayoutRole.profileAboutTop.points == 55)
    #expect(LayoutRole.profileAboutIllustrationGap.points == 16)
  }
}
