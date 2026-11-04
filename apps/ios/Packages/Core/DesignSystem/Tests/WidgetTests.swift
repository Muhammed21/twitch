import DesignSystem
import Testing

@Suite("Stream Manager à widgets, relevé sur creer/gestionnaire-diffusion--widget-actions-rapides")
struct WidgetTests {
  @Test("l'en-tête d'un widget est gris sur un corps blanc ; l'aperçu du flux est noir")
  func cardColors() {
    #expect(WidgetStyle.header == .surfaceSecondary)
    #expect(WidgetStyle.body == .surface)
    #expect(WidgetStyle.preview == .mediaBackground)
  }

  @Test("un bouton du dock est gris ; celui du widget affiché est cerclé de la couleur du texte")
  func dockColors() {
    #expect(WidgetStyle.dockButton == .surfaceSecondary)
    #expect(WidgetStyle.dockRing == .textPrimary)
  }
}
