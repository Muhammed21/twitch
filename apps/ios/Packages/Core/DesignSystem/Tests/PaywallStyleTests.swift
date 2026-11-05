import CoreGraphics
import DesignSystem
import SwiftUI
import Testing

private let paywallMeasures: [(PaywallLayout, CGFloat)] = [
  (.bandHeight, 72),
  (.headlineTop, 12),
  (.legalGap, 12),
  (.markSize, 36),
  (.savingsPaddingH, 6),
  (.savingsPaddingV, 2),
]

private func hex(of color: Color, in scheme: ColorScheme) -> String? {
  var environment = EnvironmentValues()
  environment.colorScheme = scheme
  let resolved = color.resolve(in: environment)
  guard
    let srgb = CGColorSpace(name: CGColorSpace.sRGB),
    let components = resolved.cgColor.converted(to: srgb, intent: .defaultIntent, options: nil)?.components
  else { return nil }
  return components.prefix(3).map { String(format: "%02X", Int(($0 * 255).rounded())) }.joined()
}

@Suite("Paywall Turbo : relevés sur abonnement/turbo--defaut")
struct PaywallStyleTests {
  @Test("les mesures de la bande, de la batterie, des mentions et du badge d'économie", arguments: paywallMeasures)
  func layout(role: PaywallLayout, points: CGFloat) {
    #expect(role.points == points)
  }

  @Test("la bande va du violet #B537F3 au rose #FF2F8E, dans les deux thèmes", arguments: [ColorScheme.light, .dark])
  func band(scheme: ColorScheme) {
    #expect(hex(of: ColorRole.turboStart.color, in: scheme) == "B537F3")
    #expect(hex(of: ColorRole.turboEnd.color, in: scheme) == "FF2F8E")
  }

  @Test("l'accroche en headline semibold, l'argument et la carte en body, les mentions en subheadline")
  func typography() {
    #expect(TextRole.paywallHeadline.font == Font.headline.weight(.semibold))
    #expect(TextRole.paywallBody.font == Font.body.weight(.regular))
    #expect(TextRole.paywallLegal.font == Font.subheadline.weight(.regular))
  }
}
