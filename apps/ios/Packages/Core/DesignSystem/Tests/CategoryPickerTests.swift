import DesignSystem
import SwiftUI
import Testing

private let pickerMeasures: [(LayoutRole, CGFloat)] = [
  (.categoryCardCoverWidth, 72),
  (.categoryCardRadius, 8),
  (.categoryCardBorderWidth, 1),
  (.categoryCardTextGap, 16),
  (.categoryResultCoverWidth, 75),
  (.categoryResultGap, 16),
  (.categoryResultTextGap, 8),
  (.categorySearchFieldHeight, 36),
  (.categorySearchFieldRadius, 6),
]

@Suite("Sélecteur de catégorie relevé sur creer/edition-infos-diffusion--defaut et creer/recherche-categorie--resultats-clavier-ouvert")
struct CategoryPickerTests {
  @Test("les mesures de la carte, des résultats et du champ de recherche", arguments: pickerMeasures)
  func layoutRoles(role: LayoutRole, points: CGFloat) {
    #expect(role.points == points)
  }

  @Test("la pochette est au format 3:4, comme 72 × 96 et 75 × 100 pt sur les captures")
  func coverAspect() {
    #expect(CategoryPickerStyle.coverHeight(forWidth: 72) == 96)
    #expect(CategoryPickerStyle.coverHeight(forWidth: 75) == 100)
  }

  @Test("la carte est bordée de gris clair sur un fond tertiaire, le champ sur le fond secondaire")
  func colors() {
    #expect(CategoryPickerStyle.cardBackground == .surfaceTertiary)
    #expect(CategoryPickerStyle.cardBorder == .border)
    #expect(CategoryPickerStyle.coverPlaceholder == .surfaceSecondary)
    #expect(CategoryPickerStyle.searchField == .surfaceSecondary)
    #expect(CategoryPickerStyle.name == .textPrimary)
    #expect(CategoryPickerStyle.hint == .textSecondary)
  }

  @Test("le nom d'une catégorie est en headline gras, le texte saisi en body, l'aide sous le champ en caption 12 pt")
  func textRoles() {
    #expect(TextRole.categoryName.font == Font.headline.weight(.bold))
    #expect(TextRole.fieldText.font == Font.body.weight(.regular))
    #expect(TextRole.fieldHint.font == Font.caption.weight(.regular))
  }
}
