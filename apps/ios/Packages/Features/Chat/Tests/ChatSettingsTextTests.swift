import Chat
import DesignSystem
import Testing

@Suite("Textes de la feuille Chat Settings (chat/parametres-chat--defaut)")
struct ChatSettingsTextTests {
  @Test("la feuille, sa section et le sélecteur portent les libellés de la référence")
  func labels() {
    #expect(ChatSettingsText.title == "Chat Settings")
    #expect(ChatSettingsText.identity == "IDENTITY")
    #expect(ChatSettingsText.colorTitle == "Username Color")
    #expect(ChatSettingsText.defaultColor == "Default")
    #expect(ChatSettingsText.colorFailed == "Couldn't change your username color. Try again.")
  }

  @Test(
    "chaque couleur de la palette a un nom lisible",
    arguments: zip(ChatNameColor.allCases, ["Blue", "Green", "Purple", "Red", "Maroon", "Teal", "Indigo"])
  )
  func colorNames(color: ChatNameColor, name: String) {
    #expect(ChatSettingsText.name(of: color) == name)
  }
}
