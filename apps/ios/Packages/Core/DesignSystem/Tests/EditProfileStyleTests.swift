import DesignSystem
import SwiftUI
import Testing

private let editProfileMeasures: [(LayoutRole, CGFloat)] = [
  (.profileEditTop, 8),
  (.profileEditTrailing, 24),
  (.editSectionLabelGap, 8),
  (.editRowPadding, 8),
  (.editRowLineGap, 2),
  (.bioFieldPadding, 6),
  (.bioFieldBottom, 8),
  (.bioFieldDividerHeight, 1),
  (.bioCounterInset, 20),
  (.editSectionGap, 24),
  (.editImageRowPadding, 20),
  (.brandAvatarSize, 88),
  (.brandAvatarRing, 4),
]

@Suite("Edit Profile : relevés sur profil/menu-compte--defaut, modifier-profil--defaut et modifier-bio--saisie-clavier-ouvert")
struct EditProfileStyleTests {
  @Test("la bannière suit le format recommandé 1200×480, relevé à 361 × 143 pt")
  func bannerRatio() {
    #expect(BrandStyle.bannerAspectRatio == 2.5)
  }

  @Test("sans photo, la bannière est le dégradé violet ; avec une photo de profil, elle passe au noir du média")
  func backdrop() {
    #expect(BrandBackdrop(hasAvatar: false) == .gradient(from: .bannerStart, to: .bannerEnd))
    #expect(BrandBackdrop(hasAvatar: true) == .plain(.mediaBackground))
  }

  @Test("l'avatar est cerclé de clair, le pied de section en texte secondaire")
  func brandColors() {
    #expect(BrandStyle.avatarRing == .avatarRing)
    #expect(EditProfileStyle.sectionFooter == .textSecondary)
  }

  @Test("les mesures du bouton, des lignes et de l'écran Bio", arguments: editProfileMeasures)
  func layout(role: LayoutRole, points: CGFloat) {
    #expect(role.points == points)
  }

  @Test("Edit Profile en caption medium, titres de ligne en headline bold, valeurs et compteur en subheadline")
  func textRoles() {
    #expect(TextRole.profileEdit.font == Font.caption.weight(.medium))
    #expect(TextRole.editSectionLabel.font == Font.subheadline.weight(.regular))
    #expect(TextRole.editRowTitle.font == Font.headline.weight(.bold))
    #expect(TextRole.editRowValue.font == Font.subheadline.weight(.regular))
    #expect(TextRole.bioText.font == Font.body.weight(.regular))
    #expect(TextRole.bioCounter.font == Font.subheadline.weight(.regular))
    #expect(TextRole.editSectionFooter.font == Font.footnote.weight(.regular))
  }

  @Test("Edit Profile est blanc sur la bannière, les libellés secondaires en texte secondaire")
  func colors() {
    #expect(EditProfileStyle.editButton == .onMedia)
    #expect(EditProfileStyle.sectionLabel == .textSecondary)
    #expect(EditProfileStyle.rowTitle == .textPrimary)
    #expect(EditProfileStyle.rowValue == .textSecondary)
    #expect(EditProfileStyle.divider == .border)
  }
}
