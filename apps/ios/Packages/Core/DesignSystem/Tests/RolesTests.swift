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

private let chatMeasures: [(LayoutRole, CGFloat)] = [
  (.chatInset, 8),
  (.chatRowGap, 20),
  (.chatUnreadGap, 2),
  (.chatUnreadLabelGap, 4),
  (.chatUnreadLineWidth, 1),
  (.composerHeight, 40),
  (.composerPadding, 12),
  (.composerRadius, 6),
]

private let menuMeasures: [(LayoutRole, CGFloat)] = [
  (.menuRowHeight, 56),
  (.menuRowPadding, 16),
  (.menuIconWidth, 20),
  (.menuLabelGap, 20),
  (.menuCardGap, 16),
  (.menuCardRadius, 12),
]

private let tabBarMeasures: [(LayoutRole, CGFloat)] = [
  (.tabBarHeight, 49),
  (.tabBarTopInset, 8),
  (.tabLabelGap, 2),
  (.tabIconSize, 24),
  (.tabGlyphSize, 20),
  (.avatarGlyphInset, 5),
  (.createButtonWidth, 72),
  (.createButtonHeight, 40),
  (.createGlyphSize, 14),
  (.avatarRingWidth, 2),
  (.avatarRingGap, 1),
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

  @Test(
    "les mesures du chat relevées sur chat/chat-chaine--defaut et chat/chat-chaine--saisie",
    arguments: chatMeasures
  )
  func chatLayoutRoles(role: LayoutRole, points: CGFloat) {
    #expect(role.points == points)
  }

  @Test("les mesures du menu du compte relevées sur profil/menu-compte--defaut", arguments: menuMeasures)
  func menuLayoutRoles(role: LayoutRole, points: CGFloat) {
    #expect(role.points == points)
  }

  @Test("les mesures de la barre d'onglets relevées sur profil/menu-compte--defaut", arguments: tabBarMeasures)
  func tabBarLayoutRoles(role: LayoutRole, points: CGFloat) {
    #expect(role.points == points)
  }

  @Test("les libellés de la barre d'onglets sont en caption2 medium")
  func tabBarTextRoles() {
    #expect(TextRole.tabLabel.font == Font.caption2.weight(.medium))
  }

  @Test("le nom du compte en tête du menu est en title2 gras")
  func menuTextRoles() {
    #expect(TextRole.title.font == Font.title2.weight(.bold))
  }

  @Test("un message du chat est en body régulier, son auteur en headline gras")
  func chatTextRoles() {
    #expect(TextRole.chatMessage.font == Font.body.weight(.regular))
    #expect(TextRole.chatAuthor.font == Font.headline.weight(.bold))
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

  @Test("Done de « You're All Set! » est violet à libellé blanc (auth/inscription-terminee--defaut)")
  func primaryButtonKind() {
    #expect(ActionButtonKind.primary.background == .accent)
    #expect(ActionButtonKind.primary.foreground == .onAccent)
  }
}
