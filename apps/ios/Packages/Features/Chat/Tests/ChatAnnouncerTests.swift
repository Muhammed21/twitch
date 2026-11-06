@testable import Chat
import Domain
import Foundation
import Testing

private func messages(_ range: ClosedRange<Int>) -> [ChatMessage] {
  range.map { message($0) }
}

@Suite("Annonce des nouveaux messages du chat au VoiceOver, sans inonder")
struct ChatAnnouncerTests {
  @Test("au premier passage, l'historique déjà là n'est pas annoncé")
  func backlogSilent() {
    let (_, spoken) = ChatAnnouncer().next(messages(1 ... 30))

    #expect(spoken == nil)
  }

  @Test("un seul nouveau message est lu en entier, « pseudo : message »")
  func singleMessageRead() {
    let history = messages(1 ... 3)
    let (announcer, _) = ChatAnnouncer().next(history)

    let (_, spoken) = announcer.next(history + [message(4)])

    #expect(spoken == "Viewer 4: message 4")
  }

  @Test("plusieurs nouveaux messages sont résumés en un nombre et le dernier message")
  func burstSummarized() {
    let history = messages(1 ... 3)
    let (announcer, _) = ChatAnnouncer().next(history)

    let (_, spoken) = announcer.next(history + messages(4 ... 12))

    #expect(spoken == shown(
      english: "9 new messages. Latest, Viewer 12: message 12",
      french: "9 nouveaux messages. Dernier, Viewer 12: message 12"
    ))
  }

  @Test("sans nouveau message, rien n'est annoncé")
  func nothingNew() {
    let history = messages(1 ... 3)
    let (announcer, _) = ChatAnnouncer().next(history)

    #expect(announcer.next(history).1 == nil)
  }

  @Test("un message déjà annoncé ne l'est pas deux fois")
  func announcedOnce() {
    let history = messages(1 ... 3)
    let fourth = message(4)
    let (first, _) = ChatAnnouncer().next(history)
    let (second, _) = first.next(history + [fourth])

    #expect(second.next(history + [fourth]).1 == nil)
  }

  @Test("quand le fil défile et que l'ancien message de repère disparaît, seuls les messages après lui comptent")
  func trimmedHistory() {
    let (announcer, _) = ChatAnnouncer().next(messages(1 ... 3))

    let (_, spoken) = announcer.next(messages(5 ... 6))

    #expect(spoken == shown(
      english: "2 new messages. Latest, Viewer 6: message 6",
      french: "2 nouveaux messages. Dernier, Viewer 6: message 6"
    ))
  }

  @Test("un message supprimé n'est pas annoncé")
  func deletedSkipped() {
    let history = messages(1 ... 3)
    let (announcer, _) = ChatAnnouncer().next(history)
    let deleted = ChatMessage(
      id: UUID(),
      channelID: channel,
      sessionID: nil,
      author: ChatAuthor(id: UUID(), displayName: "Viewer 4"),
      body: "message 4",
      sentAt: Date(timeIntervalSince1970: 1_793_736_900),
      isDeleted: true
    )

    #expect(announcer.next(history + [deleted]).1 == nil)
  }

  @Test("le fil est relu au plus toutes les 5 secondes, pour laisser VoiceOver finir sa phrase")
  func pace() {
    #expect(ChatAnnouncer.interval == .seconds(5))
  }
}
