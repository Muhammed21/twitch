import CoreGraphics
import DesignSystem
import SwiftUI
import Testing

private let paywallMeasures: [(LayoutRole, CGFloat)] = [
  (.paywallBandHeight, 72),
  (.paywallHeadlineTop, 12),
  (.paywallTaglineGap, 12),
  (.paywallActionTop, 24),
  (.paywallButtonInset, 44),
  (.paywallBillingGap, 8),
  (.paywallPackageGap, 16),
  (.paywallLegalGap, 12),
  (.paywallCardTop, 20),
  (.paywallCardPadding, 20),
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
  func layout(role: LayoutRole, points: CGFloat) {
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
