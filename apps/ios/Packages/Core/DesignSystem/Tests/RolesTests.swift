import DesignSystem
import SwiftUI
import Testing

private let welcomeMeasures: [(LayoutRole, CGFloat)] = [
  (.heroInset, 40),
  (.heroRowGap, 4),
  (.sloganGap, 12),
  (.sloganBottom, 12),
  (.actionInset, 20),
  (.actionGap, 16),
  (.actionHeight, 44),
  (.actionRadius, 6),
]

private let logOutDialogMeasures: [(LayoutRole, CGFloat)] = [
  (.screenInset, 16),
  (.dialogWidth, 300),
  (.dialogPadding, 16),
  (.dialogTitleGap, 15),
  (.dialogActionsTop, 16),
  (.dialogActionGap, 8),
  (.dialogRadius, 12),
]

@Suite("Rôles de texte, de mise en page et de bouton")
struct RolesTests {
  @Test("les catégories et le slogan de l'accueil sont en largeTitle gras, les boutons en headline gras")
  func textRoles() {
    #expect(TextRole.hero.font == Font.largeTitle.weight(.bold))
    #expect(TextRole.actionLabel.font == Font.headline.weight(.bold))
  }

  @Test(
    "les mesures de l'accueil relevées sur la capture",
    arguments: welcomeMeasures
  )
  func layoutRoles(role: LayoutRole, points: CGFloat) {
    #expect(role.points == points)
  }

  @Test(
    "les mesures de la modale de déconnexion relevées sur parametres/menu-parametres--modale-deconnexion",
    arguments: logOutDialogMeasures
  )
  func dialogLayoutRoles(role: LayoutRole, points: CGFloat) {
    #expect(role.points == points)
  }

  @Test("le titre de la modale est en headline gras, sa question en body régulier")
  func dialogTextRoles() {
    #expect(TextRole.dialogTitle.font == Font.headline.weight(.bold))
    #expect(TextRole.dialogMessage.font == Font.body.weight(.regular))
  }

  @Test("l'écran connecté reprend les styles display et body de la charte")
  func screenTextRoles() {
    #expect(TextRole.display.font == Font.headline.weight(.semibold))
    #expect(TextRole.body.font == Font.footnote.weight(.semibold))
  }

  @Test("le bouton principal sur l'accent est blanc à libellé noir, le secondaire violet clair à libellé blanc")
  func actionButtonKinds() {
    #expect(ActionButtonKind.primaryOnAccent.background == .onAccent)
    #expect(ActionButtonKind.primaryOnAccent.foreground == .onAccentStrong)
    #expect(ActionButtonKind.secondaryOnAccent.background == .accentSubtle)
    #expect(ActionButtonKind.secondaryOnAccent.foreground == .onAccent)
  }

  @Test("Logout est rouge à libellé noir, Cancel gris clair à libellé de texte, Log Out gris à libellé de texte")
  func dialogButtonKinds() {
    #expect(ActionButtonKind.destructive.background == .danger)
    #expect(ActionButtonKind.destructive.foreground == .onDanger)
    #expect(ActionButtonKind.cancel.background == .surfaceTertiary)
    #expect(ActionButtonKind.cancel.foreground == .textPrimary)
    #expect(ActionButtonKind.secondary.background == .surfaceSecondary)
    #expect(ActionButtonKind.secondary.foreground == .textPrimary)
  }
}
