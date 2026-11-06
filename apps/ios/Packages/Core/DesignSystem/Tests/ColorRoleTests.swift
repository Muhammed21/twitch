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
      (ColorRole.link, ColorScheme.light, "5C16C5"),
      (ColorRole.link, ColorScheme.dark, "BF94FF"),
      (ColorRole.danger, ColorScheme.light, "FE504D"),
      (ColorRole.danger, ColorScheme.dark, "FE504D"),
      (ColorRole.onDanger, ColorScheme.light, "000000"),
      (ColorRole.onDanger, ColorScheme.dark, "000000"),
      (ColorRole.scrim, ColorScheme.light, "000000"),
      (ColorRole.scrim, ColorScheme.dark, "000000"),
      (ColorRole.navigationActive, ColorScheme.light, "772CE8"),
      (ColorRole.navigationActive, ColorScheme.dark, "BF94FF"),
      (ColorRole.border, ColorScheme.light, "D9D9D9"),
      (ColorRole.border, ColorScheme.dark, "2D2D2F"),
      (ColorRole.avatarDefault, ColorScheme.light, "BFFF00"),
      (ColorRole.avatarDefault, ColorScheme.dark, "BFFF00"),
      (ColorRole.onAvatarDefault, ColorScheme.light, "000000"),
      (ColorRole.onAvatarDefault, ColorScheme.dark, "000000"),
      (ColorRole.liveIndicator, ColorScheme.light, "EB0400"),
      (ColorRole.liveIndicator, ColorScheme.dark, "EB0400"),
      (ColorRole.chatUnread, ColorScheme.light, "D80804"),
      (ColorRole.chatUnread, ColorScheme.dark, "FF6B5A"),
      (ColorRole.mediaBackground, ColorScheme.light, "000000"),
      (ColorRole.mediaBackground, ColorScheme.dark, "000000"),
      (ColorRole.liveBadge, ColorScheme.light, "EB0400"),
      (ColorRole.liveBadge, ColorScheme.dark, "EB0400"),
      (ColorRole.onLiveBadge, ColorScheme.light, "FFFFFF"),
      (ColorRole.onLiveBadge, ColorScheme.dark, "FFFFFF"),
      (ColorRole.onMedia, ColorScheme.light, "FFFFFF"),
      (ColorRole.onMedia, ColorScheme.dark, "FFFFFF"),
      (ColorRole.bannerStart, ColorScheme.light, "5C2DA8"),
      (ColorRole.bannerStart, ColorScheme.dark, "5C2DA8"),
      (ColorRole.bannerEnd, ColorScheme.light, "9147FF"),
      (ColorRole.bannerEnd, ColorScheme.dark, "9147FF"),
      (ColorRole.avatarRing, ColorScheme.light, "F7F7F8"),
      (ColorRole.avatarRing, ColorScheme.dark, "F7F7F8"),
      (ColorRole.iconDisabled, ColorScheme.light, "BFBFC2"),
      (ColorRole.iconDisabled, ColorScheme.dark, "53535F"),
      (ColorRole.surfaceRaised, ColorScheme.light, "E0E0E4"),
      (ColorRole.surfaceRaised, ColorScheme.dark, "2D2D2F"),
      (ColorRole.illustrationInk, ColorScheme.light, "000000"),
      (ColorRole.illustrationInk, ColorScheme.dark, "000000"),
      (ColorRole.illustrationOutline, ColorScheme.light, "323338"),
      (ColorRole.illustrationOutline, ColorScheme.dark, "323338"),
      (ColorRole.illustrationFill, ColorScheme.light, "FFFFFF"),
      (ColorRole.illustrationFill, ColorScheme.dark, "FFFFFF"),
      (ColorRole.widgetHeader, ColorScheme.light, "EFEFF1"),
      (ColorRole.widgetHeader, ColorScheme.dark, "29282F"),
      (ColorRole.widgetBorder, ColorScheme.light, "E2E2E6"),
      (ColorRole.widgetBorder, ColorScheme.dark, "2D2D2F"),
      (ColorRole.widgetFieldBorder, ColorScheme.light, "808084"),
      (ColorRole.widgetFieldBorder, ColorScheme.dark, "ADADB8"),
      (ColorRole.streamManagerCamera, ColorScheme.light, "E91916"),
      (ColorRole.streamManagerCamera, ColorScheme.dark, "E91916"),
      (ColorRole.streamManagerDivider, ColorScheme.light, "B2B2B2"),
      (ColorRole.streamManagerDivider, ColorScheme.dark, "2D2D2F"),
      (ColorRole.chipSelected, ColorScheme.light, "000000"),
      (ColorRole.chipSelected, ColorScheme.dark, "EFEFF1"),
      (ColorRole.onChipSelected, ColorScheme.light, "FFFFFF"),
      (ColorRole.onChipSelected, ColorScheme.dark, "000000"),
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
