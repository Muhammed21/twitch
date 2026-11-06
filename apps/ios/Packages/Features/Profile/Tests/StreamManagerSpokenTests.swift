import Profile
import Testing

@Suite("Gestionnaire de stream lu par VoiceOver")
struct StreamManagerSpokenTests {
  @Test("la clé masquée se lit « Masquée », pas une suite de points ; révélée, elle se lit telle quelle")
  func key() {
    #expect(StreamManagerSpoken.key(nil) == shown(english: "Hidden", french: "Masquée"))
    #expect(StreamManagerSpoken.key("live_123_abc") == "live_123_abc")
  }

  @Test("un titre vide se lit « Aucun titre » plutôt que rien")
  func title() {
    #expect(StreamManagerSpoken.title("") == shown(english: "No title", french: "Aucun titre"))
    #expect(StreamManagerSpoken.title("Speedrun du soir") == "Speedrun du soir")
  }

  @MainActor
  @Test("chaque avis émis compte, même répété, pour être annoncé à chaque fois ; l'effacer ne compte pas")
  func repeatedNotice() async throws {
    let store = try MyChannelStore(
      repository: FakeMyChannel(owned: .success(makeOwnedChannel())),
      channels: FakeChannels(title: "Speedrun du dimanche", category: nil, banner: nil),
      copy: { _ in },
      log: { _ in }
    )
    await store.load()
    await store.revealKey()
    let before = store.noticeCount

    store.copyKey()
    store.copyKey()
    store.leave()

    #expect(store.noticeCount == before + 2)
  }

  @Test("une copie, un échec ou un enregistrement est annoncé ; sans avis, rien")
  func announcement() {
    #expect(StreamManagerSpoken.announcement(for: .keyCopied) == shown(english: "Stream key copied.", french: "Clé de stream copiée."))
    #expect(StreamManagerSpoken.announcement(for: nil) == nil)
  }
}
