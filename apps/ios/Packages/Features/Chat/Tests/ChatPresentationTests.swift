@testable import Chat
import DesignSystem
import Domain
import Foundation
import SwiftUI
import Testing

private let english = Locale(identifier: "en_US")
private let utc = TimeZone(identifier: "UTC") ?? .current
private let timestamped = ChatDisplay(textSize: .medium, showsTimestamps: true)

private func sent(at text: String, by author: UUID = UUID()) -> ChatMessage {
  let date = (try? Date(text, strategy: .iso8601)) ?? Date()
  return ChatMessage(
    id: UUID(),
    channelID: channel,
    sessionID: nil,
    author: ChatAuthor(id: author, displayName: "yahway_810"),
    body: "valid",
    sentAt: date
  )
}

@Suite("Ligne de message du chat (chat/chat-chaine--defaut)")
struct ChatLineTests {
  @Test(
    "l'heure s'affiche en heures et minutes sur deux chiffres, sans AM/PM",
    arguments: [("2026-11-03T04:13:00Z", "04:13"), ("2026-11-03T16:05:00Z", "04:05"), ("2026-11-03T12:00:00Z", "12:00")]
  )
  func time(sentAt: String, expected: String) {
    #expect(ChatLine(sent(at: sentAt), locale: english, timeZone: utc).time == expected)
  }

  @Test(
    "l'heure suit l'horloge de la langue et garde deux chiffres",
    arguments: [("fr_FR", "2026-11-03T04:13:00Z", "04:13"), ("fr_FR", "2026-11-03T16:05:00Z", "16:05"), ("ja_JP", "2026-11-03T04:13:00Z", "04:13")]
  )
  func timeInOtherLocales(identifier: String, sentAt: String, expected: String) {
    let line = ChatLine(sent(at: sentAt), locale: Locale(identifier: identifier), timeZone: utc)

    #expect(line.time == expected)
  }

  @Test("la ligne porte l'auteur suivi de deux-points, puis le corps")
  func authorAndBody() {
    let line = ChatLine(sent(at: "2026-11-03T04:13:00Z"), locale: english, timeZone: utc)

    #expect(line.author == "yahway_810:")
    #expect(line.body == "valid")
  }

  @Test("la ligne affichée réunit l'heure, l'auteur et le corps, chacun dans son style")
  func styled() {
    let author = UUID()
    let text = ChatLine(sent(at: "2026-11-03T04:13:00Z", by: author), locale: english, timeZone: utc).styled(timestamped)

    #expect(String(text.characters) == "04:13 yahway_810: valid")
    #expect(segments(of: text) { $0.foregroundColor == ColorRole.textSecondary.color } == ["04:13"])
    #expect(segments(of: text) { $0.foregroundColor == ColorRole.chatName(author).color } == ["yahway_810:"])
    #expect(segments(of: text) { $0.font == TextRole.chatAuthor.font } == ["yahway_810:"])
    #expect(segments(of: text) { $0.foregroundColor == ColorRole.textPrimary.color } == ["valid"])
  }

  @Test("un message supprimé garde son heure et son auteur, et dit « message deleted » en texte secondaire")
  func deletedMessage() {
    let text = ChatLine(sent(at: "2026-11-03T04:13:00Z").deleted(), locale: english, timeZone: utc).styled(timestamped)

    #expect(String(text.characters) == "04:13 yahway_810: message deleted")
    #expect(segments(of: text) { $0.foregroundColor == ColorRole.textSecondary.color } == ["04:13", "message deleted"])
    #expect(segments(of: text) { $0.font == TextRole.chatMessage.font }.contains("message deleted"))
  }

  @Test("sans horodatage, la ligne commence par l'auteur")
  func withoutTimestamp() {
    let text = ChatLine(sent(at: "2026-11-03T04:13:00Z"), locale: english, timeZone: utc)
      .styled(ChatDisplay(textSize: .medium, showsTimestamps: false))

    #expect(String(text.characters) == "yahway_810: valid")
  }

  @Test(
    "la taille choisie change le rôle de texte du corps et de l'auteur",
    arguments: [
      (ChatTextSize.small, TextRole.chatMessageSmall, TextRole.chatAuthorSmall),
      (.medium, .chatMessage, .chatAuthor),
      (.large, .chatMessageLarge, .chatAuthorLarge),
    ]
  )
  func textSize(size: ChatTextSize, message: TextRole, author: TextRole) {
    let display = ChatDisplay(textSize: size, showsTimestamps: true)
    let text = ChatLine(sent(at: "2026-11-03T04:13:00Z"), locale: english, timeZone: utc).styled(display)

    #expect(display.messageRole == message)
    #expect(segments(of: text) { $0.font == author.font } == ["yahway_810:"])
    #expect(segments(of: text) { $0.font == message.font } == ["04:13", "valid"])
  }

  @Test("par défaut, le chat est en taille moyenne et sans horodatage, comme le réglage de l'appareil")
  func defaultDisplay() {
    #expect(ChatDisplay.standard == ChatDisplay(textSize: .medium, showsTimestamps: false))
    #expect(ChatDisplay(DevicePreferences.defaults(language: .english)) == .standard)
  }

  @Test("le chat reprend la taille et l'horodatage choisis sur l'appareil")
  func fromPreferences() {
    let preferences = DevicePreferences.defaults(language: .english)
      .applying(.chatTextSize(.large))
      .applying(.chatTimestamps(true))

    #expect(ChatDisplay(preferences) == ChatDisplay(textSize: .large, showsTimestamps: true))
  }

  @Test("chaque auteur garde la couleur de pseudo qui lui est attribuée")
  func authorColors() throws {
    let blue = try #require(UUID(uuidString: "00000000-0000-0000-0000-000000000007"))
    let green = try #require(UUID(uuidString: "00000000-0000-0000-0000-000000000004"))
    let colors = [blue, green].map { author in
      let text = ChatLine(sent(at: "2026-11-03T04:13:00Z", by: author), locale: english, timeZone: utc).styled(timestamped)
      return text.runs.first { String(text[$0.range].characters) == "yahway_810:" }?.foregroundColor
    }

    #expect(colors == [ColorRole.chatName(blue).color, ColorRole.chatName(green).color])
    #expect(ColorRole.chatName(blue).color != ColorRole.chatName(green).color)
  }

  private func segments(of text: AttributedString, where matches: (AttributedString.Runs.Run) -> Bool) -> [String] {
    text.runs.filter(matches).map { String(text[$0.range].characters) }
  }
}

@Suite("Brouillon du compositeur")
struct ChatDraftTests {
  @Test("un brouillon s'envoie sans les espaces qui l'entourent")
  func trimmed() {
    #expect(ChatDraft.sendable("  hi \n") == "hi")
  }

  @Test("un brouillon vide ou fait d'espaces ne s'envoie pas", arguments: ["", "   ", "\n\t"])
  func empty(text: String) {
    #expect(ChatDraft.sendable(text) == nil)
  }

  @Test("la limite de 500 se compte en unités UTF-16, comme le contrat")
  func limit() {
    #expect(ChatDraft.sendable(String(repeating: "a", count: 500)) != nil)
    #expect(ChatDraft.sendable(String(repeating: "a", count: 501)) == nil)
    #expect(ChatDraft.sendable(String(repeating: "😀", count: 250)) != nil)
    #expect(ChatDraft.sendable(String(repeating: "😀", count: 251)) == nil)
  }
}

@Suite("Retour d'un envoi au compositeur")
struct ComposerFeedbackTests {
  @Test("un message accepté vide le brouillon, sans avis")
  func accepted() {
    #expect(ComposerFeedback(.accepted) == ComposerFeedback(clearsDraft: true, notice: nil))
  }

  @Test(
    "un message refusé garde le brouillon et dit pourquoi",
    arguments: [
      (ChatRejectionReason.timedOut, "You're timed out in this chat."),
      (.banned, "You're banned from this chat."),
      (.rateLimited, "You're sending messages too quickly."),
      (.notJoined, "You're not in this chat room yet."),
      (.unknown("slow_mode"), "Your message wasn't sent."),
    ]
  )
  func rejected(reason: ChatRejectionReason, notice: String) {
    #expect(ComposerFeedback(.rejected(reason)) == ComposerFeedback(clearsDraft: false, notice: notice))
  }

  @Test(
    "un message accepté ne vide le champ que s'il contient encore le brouillon envoyé",
    arguments: [("hi", ""), (" hi ", ""), ("hi next", "hi next"), ("", "")]
  )
  func remainingAfterAccepted(current: String, remaining: String) {
    #expect(ComposerFeedback(.accepted).draft(current, after: "hi") == remaining)
  }

  @Test("un message refusé laisse le champ tel quel")
  func remainingAfterRejected() {
    #expect(ComposerFeedback(.rejected(.banned)).draft("hi", after: "hi") == "hi")
  }

  @Test("un envoi sans verdict garde le brouillon et dit que le message n'est pas parti")
  func unsent() {
    #expect(ComposerFeedback(nil) == ComposerFeedback(clearsDraft: false, notice: "Your message wasn't sent."))
  }
}

@Suite("Avis d'état de la session de chat")
struct ChatNoticeTests {
  @Test(
    "hors du direct, la liste dit où en est la session",
    arguments: [
      (ChatSession.Status.connecting, "Connecting to chat…"),
      (.reconnecting, "Reconnecting to chat…"),
      (.denied, "You can't access this chat."),
      (.halted, "Chat stopped."),
      (.signedOut, "Log in to chat."),
    ]
  )
  func notice(status: ChatSession.Status, expected: String) {
    #expect(ChatNotice.text(for: status) == expected)
  }

  @Test(
    "en direct, ou sur une chaîne introuvable que l'en-tête de la page annonce, aucun avis",
    arguments: [ChatSession.Status.live, .channelNotFound]
  )
  func silent(status: ChatSession.Status) {
    #expect(ChatNotice.text(for: status) == nil)
  }
}

@Suite("Avis de modération dans le chat")
struct ModerationNoticeTests {
  @Test(
    "le chat confirme un timeout ou dit pourquoi il a échoué",
    arguments: [
      (ChatSession.ModerationNotice.timedOut("yahway_810"), "yahway_810 is timed out for 10 minutes."),
      (.forbidden, "You can't time out users in this chat."),
      (.failed("yahway_810"), "Couldn't time out yahway_810."),
    ]
  )
  func notice(notice: ChatSession.ModerationNotice, expected: String) {
    #expect(ChatText.moderation(notice) == expected)
  }

  @Test("l'action du menu dit la durée du timeout")
  func action() {
    #expect(ChatText.timeOutAction == "Timeout for 10 minutes")
  }
}
