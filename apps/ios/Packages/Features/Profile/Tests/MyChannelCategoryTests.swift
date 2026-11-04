import Domain
import Foundation
import Profile
import Testing

@MainActor
private func makeStore(_ repository: any MyChannelRepository, category: ChannelCategory?) -> MyChannelStore {
  MyChannelStore(
    repository: repository,
    channels: FakeChannels(title: "Speedrun du dimanche", category: category),
    copy: { _ in }
  )
}

@MainActor
@Suite("Ma chaîne : catégorie de la chaîne dans Edit Stream Info")
struct MyChannelCategoryTests {
  @Test("charge la catégorie de la chaîne avec son titre")
  func loadsCategory() async throws {
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel())), category: honorOfKings)

    await store.load()

    #expect(store.category == honorOfKings)
  }

  @Test("pose la catégorie choisie et garde celle que rend le serveur")
  func setsCategory() async throws {
    let repository = try FakeMyChannel(owned: .success(makeOwnedChannel()))
    let store = makeStore(repository, category: honorOfKings)
    await store.load()

    let saved = await store.save(title: "Speedrun du dimanche", category: justChatting)

    #expect(saved)
    #expect(await repository.updates == [UpdateCall(channel: channelID, title: "Speedrun du dimanche", category: .set(justChatting.id))])
    #expect(store.category == justChatting)
  }

  @Test("retire la catégorie de la chaîne")
  func clearsCategory() async throws {
    let repository = try FakeMyChannel(owned: .success(makeOwnedChannel()))
    let store = makeStore(repository, category: honorOfKings)
    await store.load()

    await store.save(title: "Speedrun du dimanche", category: nil)

    #expect(await repository.updates.map(\.category) == [.clear])
    #expect(store.category == nil)
  }
}
