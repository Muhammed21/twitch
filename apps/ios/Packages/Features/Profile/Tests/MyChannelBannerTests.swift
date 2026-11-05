import Domain
import Foundation
import Profile
import Testing

@MainActor
private func makeStore(banner: URL? = nil) -> MyChannelStore {
  MyChannelStore(
    repository: FakeMyChannel(owned: Result { try makeOwnedChannel() }),
    channels: FakeChannels(title: "Speedrun du dimanche", category: nil, banner: banner),
    copy: { _ in }
  )
}

@MainActor
@Suite("Ma chaîne : bannière lue sur la chaîne du compte")
struct MyChannelBannerTests {
  @Test("lit la bannière de la chaîne, absente quand la chaîne n'en a pas")
  func loadsBanner() async {
    let withBanner = makeStore(banner: bannerURL)
    let without = makeStore()

    await withBanner.load()
    await without.load()

    #expect(withBanner.bannerURL == bannerURL)
    #expect(without.bannerURL == nil)
  }

  @Test("prend la bannière de la chaîne rendue après son changement")
  func bannerSaved() async throws {
    let store = makeStore()
    await store.load()

    try store.bannerSaved(Channel(id: channelID, slug: ChannelSlug("viewer_de_test"), title: "Speedrun", ownerID: ownerID, bannerURL: bannerURL))

    #expect(store.bannerURL == bannerURL)
  }
}
