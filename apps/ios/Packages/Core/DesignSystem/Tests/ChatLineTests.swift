import DesignSystem
import Foundation
import SwiftUI
import Testing

private func makeLine(author: UUID = UUID(), isDeleted: Bool = false, nameColor: ChatNameColor? = nil) -> ChatLine {
  ChatLine(time: "04:13", authorID: author, author: "yahway_810:", body: "valid", isDeleted: isDeleted, nameColor: nameColor)
}

private let timestamped = ChatLineStyle(scale: .medium, showsTimestamps: true)

@Suite("Rendu d'une ligne de chat, commun au chat et à son aperçu")
struct ChatLineTests {
  @Test(
    "chaque taille donne son rôle de texte au corps et à l'auteur",
    arguments: [
      (ChatTextScale.small, TextRole.chatMessageSmall, TextRole.chatAuthorSmall),
      (.medium, .chatMessage, .chatAuthor),
      (.large, .chatMessageLarge, .chatAuthorLarge),
    ]
  )
  func roles(scale: ChatTextScale, message: TextRole, author: TextRole) {
    let style = ChatLineStyle(scale: scale, showsTimestamps: false)

    #expect(style.messageRole == message)
    #expect(style.authorRole == author)
  }

  @Test("par défaut, une ligne est en taille moyenne et sans horodatage")
  func standard() {
    #expect(ChatLineStyle.standard == ChatLineStyle(scale: .medium, showsTimestamps: false))
  }

  @Test("avec l'horodatage, la ligne réunit l'heure, l'auteur et le corps, chacun dans son style")
  func styled() {
    let author = UUID()
    let text = makeLine(author: author).styled(timestamped)

    #expect(String(text.characters) == "04:13 yahway_810: valid")
    #expect(segments(of: text) { $0.foregroundColor == ColorRole.textSecondary.color } == ["04:13"])
    #expect(segments(of: text) { $0.foregroundColor == ColorRole.chatName(author).color } == ["yahway_810:"])
    #expect(segments(of: text) { $0.font == TextRole.chatAuthor.font } == ["yahway_810:"])
    #expect(segments(of: text) { $0.foregroundColor == ColorRole.textPrimary.color } == ["valid"])
  }

  @Test("sans horodatage, la ligne commence par l'auteur")
  func withoutTimestamp() {
    #expect(String(makeLine().styled(.standard).characters) == "yahway_810: valid")
  }

  @Test("un message supprimé s'écrit en texte secondaire")
  func deleted() {
    let text = makeLine(isDeleted: true).styled(.standard)

    #expect(segments(of: text) { $0.foregroundColor == ColorRole.textSecondary.color } == ["valid"])
  }

  @Test("une couleur de pseudo choisie remplace la couleur attribuée")
  func chosenColor() {
    let text = makeLine(nameColor: .teal).styled(.standard)

    #expect(segments(of: text) { $0.foregroundColor == ChatNameColor.teal.color } == ["yahway_810:"])
  }

  @Test("VoiceOver lit une ligne « pseudo : message », sans les badges")
  func spokenLine() {
    #expect(makeLine().spoken(.standard) == "yahway_810: valid")
  }

  @Test("avec l'horodatage, VoiceOver lit l'heure après le message, pour entendre d'abord qui parle")
  func spokenWithTime() {
    #expect(makeLine().spoken(timestamped) == "yahway_810: valid, 04:13")
  }

  private func segments(of text: AttributedString, where matches: (AttributedString.Runs.Run) -> Bool) -> [String] {
    text.runs.filter(matches).map { String(text[$0.range].characters) }
  }
}
