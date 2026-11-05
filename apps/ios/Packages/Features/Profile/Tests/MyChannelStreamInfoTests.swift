import Domain
import Foundation
import Profile
import Testing

@MainActor
private func makeStore(
  _ repository: any MyChannelRepository,
  channels: FakeChannels = FakeChannels(title: "Speedrun du dimanche", category: nil),
  deviceLanguage: LiveLanguage = .german
) -> MyChannelStore {
  MyChannelStore(repository: repository, channels: channels, copy: { _ in }, log: { _ in }, deviceLanguage: deviceLanguage)
}

@MainActor
@Suite("Ma chaîne : tags, langue, classification et contenu promotionnel (IMG_9628, IMG_9629)")
struct MyChannelStreamInfoTests {
  @Test("charge les infos du stream de la chaîne avec son titre et sa catégorie")
  func loadsStreamInfo() async throws {
    let channels = FakeChannels(
      title: "Rank",
      category: honorOfKings,
      tags: ["francais"],
      language: .french,
      contentLabels: [.gambling],
      isBrandedContent: true
    )
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel())), channels: channels)

    await store.load()

    #expect(store.info == StreamInfo(
      title: "Rank",
      category: honorOfKings,
      tags: ["francais"],
      language: .french,
      contentLabels: [.gambling],
      isBrandedContent: true
    ))
  }

  @Test("propose la langue de l'appareil quand la chaîne n'en a pas encore")
  func defaultsToDeviceLanguage() async throws {
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel())), deviceLanguage: .german)

    await store.load()

    #expect(store.proposedInfo.language == .german)
    #expect(store.info.language == nil)
  }

  @Test("enregistre la langue proposée quand la chaîne n'en a pas encore")
  func savesProposedLanguage() async throws {
    let repository = try FakeMyChannel(owned: .success(makeOwnedChannel()))
    let store = makeStore(repository, deviceLanguage: .german)
    await store.load()
    let draft = try #require(store.proposedInfo.adding(tag: "speedrun"))

    await store.save(draft)

    #expect(await repository.changes == [
      StreamInfoChange(title: "Speedrun du dimanche", category: .keep, tags: ["speedrun"], language: .german),
    ])
  }

  @Test("garde la langue de la chaîne plutôt que celle de l'appareil")
  func keepsChannelLanguage() async throws {
    let channels = FakeChannels(title: "Rank", category: nil, language: .french)
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel())), channels: channels, deviceLanguage: .german)

    await store.load()

    #expect(store.proposedInfo.language == .french)
  }

  @Test("enregistre les infos du stream et garde celles que rend le serveur")
  func savesStreamInfo() async throws {
    let repository = try FakeMyChannel(owned: .success(makeOwnedChannel()))
    let store = makeStore(repository)
    await store.load()
    let draft = try #require(store.info.adding(tag: "SpeedRun"))
      .toggling(.profanity)

    let saved = await store.save(draft)

    #expect(saved)
    #expect(await repository.changes == [
      StreamInfoChange(title: "Speedrun du dimanche", category: .keep, tags: ["speedrun"], contentLabels: [.profanity]),
    ])
    #expect(store.info.tags == ["speedrun"])
    #expect(store.info.contentLabels == [.profanity])
    #expect(store.notice == .titleSaved)
  }

  @Test("un titre changé seul ne réécrit ni la langue proposée ni les descripteurs")
  func titleOnlyKeepsOtherFields() async throws {
    let repository = try FakeMyChannel(owned: .success(makeOwnedChannel()))
    let store = makeStore(repository, deviceLanguage: .french)
    await store.load()
    var draft = store.info
    draft.title = "Any% en 2 h"

    await store.save(draft)

    #expect(await repository.changes == [StreamInfoChange(title: "Any% en 2 h", category: .keep)])
  }

  @Test("donne le lien de la chaîne à partager, celui que l'app sait ouvrir")
  func sharesChannelLink() async throws {
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel())))

    await store.load()

    #expect(store.shareURL == URL(string: "twitch://channel/viewer_de_test"))
  }

  @Test("ne donne aucun lien tant que la chaîne n'est pas chargée")
  func noLinkBeforeLoad() {
    let store = makeStore(FakeMyChannel(owned: .success(nil)))

    #expect(store.shareURL == nil)
  }
}
