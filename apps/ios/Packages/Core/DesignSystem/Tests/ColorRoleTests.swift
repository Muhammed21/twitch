import CoreGraphics
import DesignSystem
import SwiftUI
import Testing

private func hex(of resolved: Color.Resolved) -> String? {
  guard
    let srgb = CGColorSpace(name: CGColorSpace.sRGB),
    let components = resolved.cgColor.converted(to: srgb, intent: .defaultIntent, options: nil)?.components
  else { return nil }
  return components.prefix(3)
    .map { String(format: "%02X", Int(($0 * 255).rounded())) }
    .joined()
}

@Suite("Rôles de couleur du design system")
struct ColorRoleTests {
  @Test(
    "un rôle prend la valeur de son token dans le thème clair et dans le thème sombre",
    arguments: [
      (ColorRole.background, ColorScheme.light, "F7F7F8"),
      (ColorRole.background, ColorScheme.dark, "0E0E10"),
      (ColorRole.accent, ColorScheme.light, "9147FF"),
      (ColorRole.accent, ColorScheme.dark, "9147FF"),
      (ColorRole.onAccent, ColorScheme.light, "FFFFFF"),
      (ColorRole.onAccent, ColorScheme.dark, "FFFFFF"),
      (ColorRole.onAccentStrong, ColorScheme.light, "000000"),
      (ColorRole.onAccentStrong, ColorScheme.dark, "000000"),
      (ColorRole.onAccentMuted, ColorScheme.light, "5C16C5"),
      (ColorRole.onAccentMuted, ColorScheme.dark, "5C16C5"),
      (ColorRole.accentSubtle, ColorScheme.light, "A05FFF"),
      (ColorRole.accentSubtle, ColorScheme.dark, "A05FFF"),
      (ColorRole.surface, ColorScheme.light, "FFFFFF"),
      (ColorRole.surface, ColorScheme.dark, "18181B"),
      (ColorRole.surfaceSecondary, ColorScheme.light, "E8E7EA"),
      (ColorRole.surfaceSecondary, ColorScheme.dark, "29282F"),
      (ColorRole.surfaceTertiary, ColorScheme.light, "EEEDF0"),
      (ColorRole.surfaceTertiary, ColorScheme.dark, "29282F"),
      (ColorRole.textPrimary, ColorScheme.light, "0E0E10"),
      (ColorRole.textPrimary, ColorScheme.dark, "EFEFF1"),
      (ColorRole.textSecondary, ColorScheme.light, "53535F"),
      (ColorRole.textSecondary, ColorScheme.dark, "ADADB8"),
      (ColorRole.danger, ColorScheme.light, "FE504D"),
      (ColorRole.danger, ColorScheme.dark, "FE504D"),
      (ColorRole.onDanger, ColorScheme.light, "000000"),
      (ColorRole.onDanger, ColorScheme.dark, "000000"),
      (ColorRole.scrim, ColorScheme.light, "000000"),
      (ColorRole.scrim, ColorScheme.dark, "000000"),
    ]
  )
  func resolvesToken(role: ColorRole, scheme: ColorScheme, expected: String) {
    #expect(hex(of: role.color.resolved(in: scheme)) == expected)
  }

  @Test(
    "le voile sous une modale assombrit l'écran à 60 %, relevé sur parametres/menu-parametres--modale-deconnexion",
    arguments: [ColorScheme.light, ColorScheme.dark]
  )
  func scrimOpacity(scheme: ColorScheme) {
    #expect(abs(ColorRole.scrim.color.resolved(in: scheme).opacity - 0.6) < 0.002)
  }

  @Test(
    "les autres rôles sont opaques",
    arguments: [ColorRole.surface, .surfaceTertiary, .danger, .textPrimary]
  )
  func opaque(role: ColorRole) {
    #expect(role.color.resolved(in: .light).opacity == 1)
  }
}
