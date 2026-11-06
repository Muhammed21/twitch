@testable import Chat
import Testing

@Suite("Chat dans le widget du gestionnaire de stream (IMG_9618)")
struct ChatWidgetTests {
  @Test("le widget du créateur accueille sur le chat de sa chaîne, nommée")
  func channelWelcome() {
    #expect(ChatText.welcome(.channel("fakup_")) == shown(
      english: "Welcome to fakup_'s chat!",
      french: "Bienvenue sur le chat de fakup_\u{00A0}!"
    ))
  }

  @Test("le champ du widget garde le bouton d'émoticônes de la capture, désactivé tant qu'aucun sélecteur n'existe")
  func widgetEmote() {
    #expect(ChatStyle.widget.showsEmote)
    #expect(!ChatStyle.widget.isEmoteEnabled)
    #expect(!ChatStyle.channel.showsEmote)
  }

  @Test("le fil et le champ du widget se posent sur le blanc de la carte, ceux de la page de chaîne sur le fond")
  func backgrounds() {
    #expect(ChatStyle.widget.background == .surface)
    #expect(ChatStyle.channel.background == .background)
  }
}
