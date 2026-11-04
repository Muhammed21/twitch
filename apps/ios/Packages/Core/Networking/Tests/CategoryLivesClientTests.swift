import Domain
import Foundation
import Networking
import Testing

private let channelID = ChannelID(UUID(uuidString: "0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d")!)

private func liveJSON(slug: String = "jean_dupont") -> String {
  #"{"channelId":"0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d","slug":"\#(slug)","title":"Speedrun","startedAt":"2026-11-03T18:30:00Z","viewerCount":42}"#
}

private func makeClient(_ transport: FakeTransport) -> CategoryLivesClient {
  CategoryLivesClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport)
}

@Suite("Lives d'une catégorie sur GET /v1/categories/{slug}/lives (ADR 0047)")
struct CategoryLivesClientTests {
  @Test("demande la première page de la catégorie sans curseur ni authentification, et décode lives et curseur suivant")
  func firstPage() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(liveJSON())],"nextCursor":"c2"}"#)

    let page = try await makeClient(transport).lives(in: CategorySlug("just-chatting"), after: nil)

    #expect(try page == LivePage(
      lives: [LiveChannel(
        session: StreamSession(channelID: channelID, startedAt: Date(timeIntervalSince1970: 1_793_730_600)),
        slug: ChannelSlug("jean_dupont"),
        title: "Speedrun",
        viewers: ViewerCount(42)
      )],
      nextCursor: LiveCursor("c2")
    ))
    let request = try #require(await transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url == URL(string: "http://127.0.0.1:3000/v1/categories/just-chatting/lives"))
    #expect(request.headers["Authorization"] == nil)
  }

  @Test("passe le curseur reçu pour la page suivante ; sans nextCursor, la liste est finie")
  func nextPage() async throws {
    let transport = FakeTransport(json: #"{"items":[]}"#)

    let page = try await makeClient(transport).lives(in: CategorySlug("fortnite"), after: LiveCursor("WyIyMDI2Il0&x=1 2"))

    #expect(page == LivePage(lives: [], nextCursor: nil))
    let url = try #require(await transport.requests.first?.url)
    let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
    #expect(components.path == "/v1/categories/fortnite/lives")
    #expect(components.queryItems == [URLQueryItem(name: "cursor", value: "WyIyMDI2Il0&x=1 2")])
  }

  @Test("écarte un live au slug invalide sans perdre le reste de la page")
  func dropsMalformedSlug() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(liveJSON(slug: "Jean Dupont")),\#(liveJSON())]}"#)

    let page = try await makeClient(transport).lives(in: CategorySlug("just-chatting"), after: nil)

    #expect(page.lives.map(\.slug.rawValue) == ["jean_dupont"])
  }

  @Test("traduit la catégorie inconnue, un 404 RFC 9457, en ServiceProblem")
  func unknownCategory() async throws {
    let transport = FakeTransport(status: 404, json: #"{"type":"about:blank","title":"Not Found","status":404}"#)

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Not Found", status: 404, detail: nil)) {
      try await makeClient(transport).lives(in: CategorySlug("inconnue"), after: nil)
    }
  }
}
