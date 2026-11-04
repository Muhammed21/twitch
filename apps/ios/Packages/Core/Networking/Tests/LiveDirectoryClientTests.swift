import Domain
import Foundation
import Networking
import Testing

private let livesURL = URL(string: "http://127.0.0.1:3000/v1/lives")!
private let channelID = ChannelID(UUID(uuidString: "0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d")!)

private func liveJSON(slug: String = "jean_dupont", startedAt: String = "2026-11-03T18:30:00Z", viewerCount: Int? = nil) -> String {
  let viewers = viewerCount.map { #","viewerCount":\#($0)"# } ?? ""
  return #"{"channelId":"0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d","slug":"\#(slug)","title":"Speedrun","startedAt":"\#(startedAt)"\#(viewers)}"#
}

private func makeClient(_ transport: FakeTransport) -> LiveDirectoryClient {
  LiveDirectoryClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport)
}

@Suite("Lives en cours sur GET /v1/lives")
struct LiveDirectoryClientTests {
  @Test("demande la première page sans curseur et décode lives et curseur suivant")
  func firstPage() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(liveJSON())],"nextCursor":"c2"}"#)

    let page = try await makeClient(transport).lives(after: nil)

    #expect(try page == LivePage(
      lives: [LiveChannel(
        session: StreamSession(channelID: channelID, startedAt: Date(timeIntervalSince1970: 1_793_730_600)),
        slug: ChannelSlug("jean_dupont"),
        title: "Speedrun",
        viewers: nil
      )],
      nextCursor: LiveCursor("c2")
    ))
    let request = try #require(await transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url == livesURL)
    #expect(request.headers["Authorization"] == nil)
  }

  @Test("passe le curseur reçu pour la page suivante ; sans nextCursor, la liste est finie")
  func nextPage() async throws {
    let transport = FakeTransport(json: #"{"items":[]}"#)

    let page = try await makeClient(transport).lives(after: LiveCursor("WyIyMDI2Il0&x=1 2"))

    #expect(page == LivePage(lives: [], nextCursor: nil))
    let url = try #require(await transport.requests.first?.url)
    let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
    #expect(components.path == livesURL.path())
    #expect(components.queryItems == [URLQueryItem(name: "cursor", value: "WyIyMDI2Il0&x=1 2")])
  }

  @Test(
    "lit une date avec ou sans millisecondes (ADR 0024, §6)",
    arguments: [
      ("2026-11-03T18:30:00Z", 1_793_730_600.0),
      ("2026-11-03T18:30:00.5Z", 1_793_730_600.5),
      ("2026-11-03T18:30:00.123Z", 1_793_730_600.123),
    ]
  )
  func toleratesFractionalSeconds(startedAt: String, expected: TimeInterval) async throws {
    let transport = FakeTransport(json: #"{"items":[\#(liveJSON(startedAt: startedAt))]}"#)

    let page = try await makeClient(transport).lives(after: nil)

    let started = try #require(page.lives.first?.session.startedAt)
    #expect(abs(started.timeIntervalSince1970 - expected) < 0.000_5)
  }

  @Test("refuse une date qui n'est pas ISO 8601")
  func rejectsMalformedDate() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(liveJSON(startedAt: "03/11/2026 18:30"))]}"#)

    await #expect(throws: DecodingError.self) {
      try await makeClient(transport).lives(after: nil)
    }
  }

  @Test("écarte un live au slug invalide sans perdre le reste de la page")
  func dropsMalformedSlug() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(liveJSON(slug: "Jean-Dupont")),\#(liveJSON())],"nextCursor":"c2"}"#)

    let page = try await makeClient(transport).lives(after: nil)

    #expect(page.lives.map(\.slug.rawValue) == ["jean_dupont"])
    #expect(page.nextCursor == LiveCursor("c2"))
  }

  @Test("lit le nombre de viewers de chaque live, zéro compris", arguments: [0, 42])
  func readsViewerCount(count: Int) async throws {
    let transport = FakeTransport(json: #"{"items":[\#(liveJSON(viewerCount: count))]}"#)

    let page = try await makeClient(transport).lives(after: nil)

    #expect(try page.lives.first?.viewers == ViewerCount(count))
  }

  @Test("laisse le nombre de viewers inconnu quand l'API ne le donne pas")
  func unknownViewerCount() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(liveJSON())]}"#)

    let page = try await makeClient(transport).lives(after: nil)

    let live = try #require(page.lives.first)
    #expect(live.viewers == nil)
  }

  @Test("garde le live et ignore un nombre de viewers négatif")
  func ignoresNegativeViewerCount() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(liveJSON(viewerCount: -1))]}"#)

    let page = try await makeClient(transport).lives(after: nil)

    let live = try #require(page.lives.first)
    #expect(live.viewers == nil)
  }

  @Test("tolère un champ ajouté au live et à la page (ADR 0024, §8)")
  func toleratesAddedFields() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(liveJSON().dropLast()),"thumbnail":"t.png"}],"total":1}"#)

    let page = try await makeClient(transport).lives(after: nil)

    #expect(page.lives.count == 1)
  }

  @Test("traduit une réponse d'erreur RFC 9457 en ServiceProblem")
  func translatesProblem() async throws {
    let transport = FakeTransport(status: 400, json: #"{"type":"about:blank","title":"Bad Request","status":400}"#)

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Bad Request", status: 400, detail: nil)) {
      try await makeClient(transport).lives(after: nil)
    }
  }
}
