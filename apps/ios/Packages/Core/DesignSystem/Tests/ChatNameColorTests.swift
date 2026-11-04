import CoreGraphics
import DesignSystem
import Foundation
import SwiftUI
import Testing

private func hex(of color: Color, in scheme: ColorScheme) -> String? {
  guard
    let srgb = CGColorSpace(name: CGColorSpace.sRGB),
    let components = color.resolved(in: scheme).cgColor.converted(to: srgb, intent: .defaultIntent, options: nil)?.components
  else { return nil }
  return components.prefix(3)
    .map { String(format: "%02X", Int(($0 * 255).rounded())) }
    .joined()
}

private func author(_ suffix: Int) -> UUID {
  UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", suffix)) ?? UUID()
}

@Suite("Couleur de pseudo dans le chat (issue #172)")
struct ChatNameColorTests {
  @Test(
    "un auteur reçoit toujours la même couleur de la palette, d'un lancement à l'autre",
    arguments: [
      (7, "006BD2", "4DA3FF"),
      (4, "007D00", "3CC23C"),
      (1, "872DDF", "B57BFF"),
      (5, "C92309", "FF6B5A"),
      (2, "A72B2D", "F08C8C"),
      (6, "347274", "5FB8BA"),
      (3, "615EC8", "9C9AFF"),
    ]
  )
  func stable(suffix: Int, light: String, dark: String) {
    let color = ColorRole.chatName(author(suffix)).color

    #expect(hex(of: color, in: .light) == light)
    #expect(hex(of: color, in: .dark) == dark)
  }

  @Test("les auteurs se répartissent sur les sept couleurs de la palette")
  func spread() {
    let used = Set((1 ... 70).compactMap { hex(of: ColorRole.chatName(author($0)).color, in: .light) })

    #expect(used == ["006BD2", "007D00", "872DDF", "C92309", "A72B2D", "347274", "615EC8"])
  }
}
