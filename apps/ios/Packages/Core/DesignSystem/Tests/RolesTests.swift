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

  @Test("le bouton principal sur l'accent est blanc à libellé noir, le secondaire violet clair à libellé blanc")
  func actionButtonKinds() {
    #expect(ActionButtonKind.primaryOnAccent.background == .onAccent)
    #expect(ActionButtonKind.primaryOnAccent.foreground == .onAccentStrong)
    #expect(ActionButtonKind.secondaryOnAccent.background == .accentSubtle)
    #expect(ActionButtonKind.secondaryOnAccent.foreground == .onAccent)
  }
}
