@testable import Chat
import Domain
import Foundation
import Testing

@Suite("Fil du chat : bienvenue et séparateur New (chat/chat-chaine--defaut)")
struct ChatFeedTests {
  @Test("le salon rejoint commence par le message de bienvenue, avant les messages")
  func welcomeOnJoin() {
    let messages = [message(1), message(2)]

    #expect(ChatFeed.entries(messages, status: .live, unread: UnreadMarker()) == [.welcome] + messages.map(ChatEntry.message))
  }

  @Test(
    "tant que le salon n'est pas rejoint et qu'aucun message n'est arrivé, le fil reste vide",
    arguments: [ChatSession.Status.connecting, .reconnecting, .denied, .halted, .signedOut, .channelNotFound]
  )
  func noWelcomeBeforeJoin(status: ChatSession.Status) {
    #expect(ChatFeed.entries([], status: status, unread: UnreadMarker()).isEmpty)
  }

  @Test("pendant une reconnexion, le fil garde la bienvenue au-dessus des messages déjà reçus")
  func welcomeKeptWhileReconnecting() {
    let messages = [message(1)]

    #expect(ChatFeed.entries(messages, status: .reconnecting, unread: UnreadMarker()) == [.welcome, .message(messages[0])])
  }

  @Test("le séparateur New se place juste avant le premier message non lu")
  func separatorBeforeFirstUnread() {
    let read = message(1)
    let fresh = [message(2), message(3)]
    let unread = UnreadMarker().arrived([read] + fresh, after: [read], isAtEnd: false)

    #expect(ChatFeed.entries([read] + fresh, status: .live, unread: unread) == [.welcome, .message(read), .unread] + fresh.map(ChatEntry.message))
  }

  @Test("un message non lu sorti de la fenêtre du chat n'affiche plus de séparateur")
  func separatorGoneWithItsMessage() {
    let read = message(1)
    let dropped = message(2)
    let kept = message(3)
    let unread = UnreadMarker().arrived([read, dropped], after: [read], isAtEnd: false)

    #expect(ChatFeed.entries([kept], status: .live, unread: unread) == [.welcome, .message(kept)])
  }

  @Test("chaque entrée du fil a un identifiant distinct, stable pour un même message")
  func identifiers() {
    let messages = [message(1), message(2)]
    let unread = UnreadMarker().arrived(messages, after: [messages[0]], isAtEnd: false)
    let entries = ChatFeed.entries(messages, status: .live, unread: unread)

    #expect(Set(entries.map(\.id)).count == entries.count)
    #expect(ChatEntry.message(messages[0]).id == ChatEntry.message(messages[0]).id)
  }
}

@Suite("Marque des messages non lus")
struct UnreadMarkerTests {
  @Test("au bas du chat, les messages arrivés sont lus aussitôt")
  func readAtEnd() {
    let marker = UnreadMarker().arrived([message(1), message(2)], after: [], isAtEnd: true)

    #expect(marker.messageID == nil)
  }

  @Test("loin du bas, le premier message arrivé devient le premier non lu")
  func firstUnreadAwayFromEnd() {
    let read = message(1)
    let fresh = message(2)
    let marker = UnreadMarker().arrived([read, fresh, message(3)], after: [read], isAtEnd: false)

    #expect(marker.messageID == fresh.id)
  }

  @Test("les arrivées suivantes, sans retour au bas, gardent le premier non lu")
  func keepsFirstUnreadUntilEnd() {
    let read = message(1)
    let first = message(2)
    let marker = UnreadMarker()
      .arrived([read, first], after: [read], isAtEnd: false)
      .arrived([read, first, message(3)], after: [read, first], isAtEnd: false)

    #expect(marker.messageID == first.id)
  }

  @Test("revenu au bas, le séparateur reste en place jusqu'aux prochains non lus")
  func keptAfterReachingEnd() {
    let read = message(1)
    let first = message(2)
    let marker = UnreadMarker()
      .arrived([read, first], after: [read], isAtEnd: false)
      .reachedEnd()

    #expect(marker.messageID == first.id)
    #expect(marker.arrived([read, first, message(3)], after: [read, first], isAtEnd: true).messageID == first.id)
  }

  @Test("après un retour au bas, de nouveaux non lus déplacent le séparateur")
  func movesAfterReachingEnd() {
    let read = message(1)
    let first = message(2)
    let next = message(3)
    let marker = UnreadMarker()
      .arrived([read, first], after: [read], isAtEnd: false)
      .reachedEnd()
      .arrived([read, first, next], after: [read, first], isAtEnd: false)

    #expect(marker.messageID == next.id)
  }

  @Test("sans message nouveau, la marque ne bouge pas")
  func noFreshMessage() {
    let read = message(1)

    #expect(UnreadMarker().arrived([read], after: [read], isAtEnd: false) == UnreadMarker())
  }
}

@Suite("Lignes visibles du fil")
struct ChatViewportTests {
  @Test("un fil vide est au bas")
  func emptyFeedIsAtEnd() {
    #expect(ChatViewport().isAtEnd(after: []))
  }

  @Test("le fil est au bas quand le dernier message déjà reçu est visible")
  func atEndWhenLastVisible() {
    let messages = [message(1), message(2)]
    let viewport = ChatViewport().appeared(messages[0].id).appeared(messages[1].id)

    #expect(viewport.isAtEnd(after: messages))
  }

  @Test("un message arrivé sous l'écran, jamais apparu, ne compte pas comme visible")
  func arrivalBelowScreen() {
    let shown = message(1)
    let below = message(2)
    let viewport = ChatViewport().appeared(shown.id)

    #expect(!viewport.isAtEnd(after: [shown, below]))
  }

  @Test("le dernier message sorti de l'écran laisse le fil loin du bas")
  func lastScrolledAway() {
    let messages = [message(1), message(2)]
    let viewport = ChatViewport().appeared(messages[0].id).appeared(messages[1].id).disappeared(messages[1].id)

    #expect(!viewport.isAtEnd(after: messages))
  }
}

@Suite("Textes du fil du chat")
struct ChatFeedTextTests {
  @Test("le message de bienvenue et le séparateur reprennent les libellés des captures")
  func texts() {
    #expect(ChatText.welcome(.room) == shown(english: "Welcome to the chat room!", french: "Bienvenue sur le chat\u{00A0}!"))
    #expect(ChatText.unread == shown(english: "New", french: "Nouveau"))
  }
}
