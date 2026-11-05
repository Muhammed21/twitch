import Domain
import Foundation
import Networking
import Testing

private let channelURL = URL(string: "http://127.0.0.1:3000/v1/channels/jean_dupont")!

private func channelJSON(slug: String = "jean_dupont") -> String {
  #"{"id":"0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d","slug":"\#(slug)","title":"Speedrun","ownerId":"4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b","tags":[],"contentLabels":[],"isBrandedContent":false}"#
}

private func makeClient(_ transport: FakeTransport) -> ChannelClient {
  ChannelClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport)
}

@Suite("Chaîne par son slug sur GET /v1/channels/{slug}")
struct ChannelClientTests {
  @Test("décode la chaîne, demandée sans jeton")
  func channel() async throws {
    let transport = FakeTransport(json: channelJSON())

    let channel = try await makeClient(transport).channel(withSlug: ChannelSlug("jean_dupont"))

    #expect(try channel == Channel(
      id: ChannelID(#require(UUID(uuidString: "0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d"))),
      slug: ChannelSlug("jean_dupont"),
      title: "Speedrun",
      ownerID: #require(UUID(uuidString: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b"))
    ))
    let request = try #require(await transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url == channelURL)
    #expect(request.headers["Authorization"] == nil)
  }

  @Test("lit l'adresse de la bannière quand la chaîne en a une")
  func readsBanner() async throws {
    let transport = FakeTransport(json: channelJSON().dropLast() + #","bannerUrl":"https://cdn.twitch.local/banners/jean.jpg"}"#)

    let channel = try await makeClient(transport).channel(withSlug: ChannelSlug("jean_dupont"))

    #expect(channel.bannerURL == URL(string: "https://cdn.twitch.local/banners/jean.jpg"))
  }

  @Test("sans bannière, l'adresse reste absente")
  func noBanner() async throws {
    let channel = try await makeClient(FakeTransport(json: channelJSON())).channel(withSlug: ChannelSlug("jean_dupont"))

    #expect(channel.bannerURL == nil)
  }

  @Test("lit la catégorie de la chaîne quand elle en a une")
  func readsCategory() async throws {
    let category = #","category":{"id":"1c9e4a52-7d3b-4f8e-a6b1-2d5c8e9f0a13","slug":"honor-of-kings","name":"Honor of Kings"}}"#
    let transport = FakeTransport(json: channelJSON().dropLast() + category)

    let channel = try await makeClient(transport).channel(withSlug: ChannelSlug("jean_dupont"))

    #expect(try channel.category == ChannelCategory(
      id: CategoryID(#require(UUID(uuidString: "1c9e4a52-7d3b-4f8e-a6b1-2d5c8e9f0a13"))),
      name: "Honor of Kings"
    ))
  }

  @Test("une chaîne sans catégorie n'en a pas")
  func noCategory() async throws {
    let transport = FakeTransport(json: channelJSON())

    let channel = try await makeClient(transport).channel(withSlug: ChannelSlug("jean_dupont"))

    #expect(channel.category == nil)
  }

  @Test("refuse une chaîne au slug invalide")
  func rejectsMalformedSlug() async throws {
    let transport = FakeTransport(json: channelJSON(slug: "Jean-Dupont"))

    await #expect(throws: ChannelSlugError.malformed) {
      try await makeClient(transport).channel(withSlug: ChannelSlug("jean_dupont"))
    }
  }

  @Test("traduit une chaîne introuvable en ServiceProblem")
  func translatesProblem() async throws {
    let transport = FakeTransport(
      status: 404,
      json: #"{"type":"about:blank","title":"Chaîne introuvable","status":404}"#
    )

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Chaîne introuvable", status: 404, detail: nil)) {
      try await makeClient(transport).channel(withSlug: ChannelSlug("jean_dupont"))
    }
  }
}
