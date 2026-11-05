import Chat
import DesignSystem
import Testing

@Suite("Textes de la feuille Chat Settings (chat/parametres-chat--defaut)")
struct ChatSettingsTextTests {
  @Test("la feuille, sa section et le sélecteur portent les libellés de la référence")
  func labels() {
    #expect(ChatSettingsText.title == shown(english: "Chat Settings", french: "Paramètres du chat"))
    #expect(ChatSettingsText.identity == shown(english: "IDENTITY", french: "IDENTITÉ"))
    #expect(ChatSettingsText.colorTitle == shown(english: "Username Color", french: "Couleur du pseudo"))
    #expect(ChatSettingsText.defaultColor == shown(english: "Default", french: "Par défaut"))
    #expect(ChatSettingsText.colorFailed == shown(english: "Couldn't change your username color. Try again.", french: "Impossible de changer la couleur de votre pseudo. Réessayez."))
  }

  @Test(
    "chaque couleur de la palette a un nom lisible",
    arguments: zip(ChatNameColor.allCases, [
      shown(english: "Blue", french: "Bleu"),
      shown(english: "Green", french: "Vert"),
      shown(english: "Purple", french: "Violet"),
      shown(english: "Red", french: "Rouge"),
      shown(english: "Maroon", french: "Bordeaux"),
      shown(english: "Teal", french: "Bleu canard"),
      shown(english: "Indigo", french: "Indigo"),
    ])
  )
  func colorNames(color: ChatNameColor, name: String) {
    #expect(ChatSettingsText.name(of: color) == name)
  }
}
