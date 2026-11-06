import Domain
import Foundation
import Profile
import Testing

actor FlakyMyChannel: MyChannelRepository {
  private var failuresLeft: Int

  init(failuresLeft: Int) {
    self.failuresLeft = failuresLeft
  }

  func ownedChannel() throws -> OwnedChannel? {
    guard failuresLeft == 0 else {
      failuresLeft -= 1
      throw Refused()
    }
    return try makeOwnedChannel()
  }

  func streamKey(of _: ChannelID) -> StreamKey {
    StreamKey(secret, ingestURL: ingestURL)
  }

  func update(_ channel: ChannelID, change: StreamInfoChange) throws -> Channel {
    try Channel(id: channel, slug: ChannelSlug("viewer_de_test"), title: change.title, ownerID: ownerID)
  }

  func rotateStreamKey(of _: ChannelID) -> StreamKey {
    StreamKey(rotatedSecret, ingestURL: ingestURL)
  }
}

@MainActor
private func makeStore(_ repository: any MyChannelRepository) -> MyChannelStore {
  MyChannelStore(
    repository: repository,
    channels: FakeChannels(title: "Speedrun du dimanche", category: honorOfKings, banner: nil),
    copy: { _ in },
    log: { _ in }
  )
}

@MainActor
@Suite("Modifier les infos du stream depuis l'accueil du tableau de bord (IMG_9624)")
struct MyChannelEditingTests {
  @Test("la feuille s'ouvre sur le titre et la catégorie de la chaîne, chargée au premier toucher")
  func loadsBeforeEditing() async {
    let store = makeStore(FlakyMyChannel(failuresLeft: 0))

    let canEdit = await store.loadForEditing()

    #expect(canEdit)
    #expect(store.title == "Speedrun du dimanche")
    #expect(store.category == honorOfKings)
  }

  @Test("un chargement échoué est relancé avant d'ouvrir la feuille")
  func retriesFailedLoad() async {
    let store = makeStore(FlakyMyChannel(failuresLeft: 1))
    await store.load()

    let canEdit = await store.loadForEditing()

    #expect(store.phase != .failed)
    #expect(canEdit)
  }

  @Test("la feuille reste fermée quand la chaîne reste injoignable")
  func staysClosedWhenUnreachable() async {
    let store = makeStore(FakeMyChannel(owned: .failure(Refused())))

    let canEdit = await store.loadForEditing()

    #expect(!canEdit)
  }

  @Test("la feuille reste fermée quand le compte n'a pas de chaîne")
  func staysClosedWithoutChannel() async {
    let store = makeStore(FakeMyChannel(owned: .success(nil)))

    let canEdit = await store.loadForEditing()

    #expect(!canEdit)
  }
}
