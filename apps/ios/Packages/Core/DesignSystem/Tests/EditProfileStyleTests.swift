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
  (.bioCounterInset, 20),
]

@Suite("Edit Profile : relevés sur profil/menu-compte--defaut, modifier-profil--defaut et modifier-bio--saisie-clavier-ouvert")
struct EditProfileStyleTests {
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
