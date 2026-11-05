import DesignSystem
import SwiftUI
import Testing

@Suite("Palette fermée des couleurs de pseudo au choix d'un abonné Turbo (ADR 0051)")
struct ChatNameChoiceTests {
  @Test("la palette reprend les couleurs de pseudo du chat, qui passent AA en clair et en sombre")
  func paletteIsChatNames() {
    #expect(ChatNameColor.allCases.map(\.rawValue) == ["blue", "green", "purple", "red", "maroon", "teal", "indigo"])
    #expect(Set(ChatNameColor.allCases.map(\.color)).count == ChatNameColor.allCases.count)
  }

  @Test("chaque couleur s'échange en #RRGGBB, sa valeur du thème clair, et se relit telle quelle", arguments: ChatNameColor.allCases)
  func wireRoundTrip(color: ChatNameColor) {
    let hex = color.hex

    #expect(hex.count == 7)
    #expect(hex.hasPrefix("#"))
    #expect(hex == hex.uppercased())
    #expect(ChatNameColor(hex: hex) == color)
    #expect(ChatNameColor(hex: hex.lowercased()) == color)
  }

  @Test("une couleur hors palette ou mal formée ne donne aucune couleur", arguments: ["#123456", "blue", "", "#GGGGGG"])
  func outsidePalette(hex: String) {
    #expect(ChatNameColor(hex: hex) == nil)
  }

  @Test("en sombre, la couleur choisie prend sa variante du thème sombre")
  func darkVariant() {
    #expect(ChatNameColor.blue.color.resolved(in: .dark) != ChatNameColor.blue.color.resolved(in: .light))
  }
}
