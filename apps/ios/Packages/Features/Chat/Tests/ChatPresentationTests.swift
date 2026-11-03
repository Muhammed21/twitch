@testable import Chat
import DesignSystem
import Domain
import Foundation
import SwiftUI
import Testing

private let english = Locale(identifier: "en_US")
private let utc = TimeZone(identifier: "UTC") ?? .current

private func sent(at text: String) -> ChatMessage {
  let date = (try? Date(text, strategy: .iso8601)) ?? Date()
  return ChatMessage(
    id: UUID(),
    channelID: channel,
    sessionID: nil,
    author: ChatAuthor(id: UUID(), displayName: "yahway_810"),
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
    let text = ChatLine(sent(at: "2026-11-03T04:13:00Z"), locale: english, timeZone: utc).styled

    #expect(String(text.characters) == "04:13 yahway_810: valid")
    #expect(segments(of: text) { $0.foregroundColor == ColorRole.textSecondary.color } == ["04:13"])
    #expect(segments(of: text) { $0.foregroundColor == ColorRole.link.color } == ["yahway_810:"])
    #expect(segments(of: text) { $0.font == TextRole.chatAuthor.font } == ["yahway_810:"])
    #expect(segments(of: text) { $0.foregroundColor == ColorRole.textPrimary.color } == ["valid"])
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

  @Test("en direct, aucun avis")
  func live() {
    #expect(ChatNotice.text(for: .live) == nil)
  }
}
