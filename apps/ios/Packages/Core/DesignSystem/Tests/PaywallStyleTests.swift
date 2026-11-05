import CoreGraphics
import DesignSystem
import SwiftUI
import Testing

private let paywallMeasures: [(PaywallLayout, CGFloat)] = [
  (.bandHeight, 72),
  (.headlineTop, 12),
  (.taglineGap, 12),
  (.actionTop, 24),
  (.buttonInset, 44),
  (.billingGap, 8),
  (.packageGap, 16),
  (.legalGap, 12),
  (.cardTop, 20),
  (.cardPadding, 20),
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
  @Test("les mesures de la bande, des boutons, des mentions et de la carte", arguments: paywallMeasures)
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
