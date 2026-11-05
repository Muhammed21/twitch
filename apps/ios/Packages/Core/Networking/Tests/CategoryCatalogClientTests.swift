import Domain
import Foundation
import Networking
import Testing

private let catalogURL = URL(string: "http://127.0.0.1:3000/v1/categories/catalog")!

private func categoryJSON(id: String = "1c9e4a52-7d3b-4f8e-a6b1-2d5c8e9f0a13", name: String = "Mobile Legends: Bang Bang") -> String {
  #"{"id":"\#(id)","slug":"mobile-legends-bang-bang","name":"\#(name)"}"#
}

private func makeClient(_ transport: FakeTransport) -> CategoryCatalogClient {
  CategoryCatalogClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport)
}

@Suite("Recherche de catégories sur GET /v1/categories/catalog")
struct CategoryCatalogClientTests {
  @Test("cherche les catégories dont le nom contient le texte saisi, sans jeton")
  func searches() async throws {
    let transport = FakeTransport(json: #"{"categories":[\#(categoryJSON())]}"#)

    let categories = try await makeClient(transport).categories(matching: "mobile legends")

    #expect(try categories == [ChannelCategory(
      id: CategoryID(#require(UUID(uuidString: "1c9e4a52-7d3b-4f8e-a6b1-2d5c8e9f0a13"))),
      name: "Mobile Legends: Bang Bang"
    )])
    let request = try #require(await transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.headers["Authorization"] == nil)
    let url = try #require(request.url)
    let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
    #expect(components.path == catalogURL.path())
    #expect(components.queryItems == [URLQueryItem(name: "q", value: "mobile legends")])
  }

  @Test(
    "lit la pochette http(s) d'une catégorie ; absente ou d'un autre schéma, la pochette reste vide",
    arguments: [
      (#","imageUrl":"https://cdn.example/categories/mlbb.jpg""#, URL(string: "https://cdn.example/categories/mlbb.jpg")),
      (#","imageUrl":"file:///etc/passwd""#, nil),
      ("", nil),
    ]
  )
  func readsCover(field: String, expected: URL?) async throws {
    let transport = FakeTransport(json: #"{"categories":[\#(categoryJSON().dropLast())\#(field)}]}"#)

    let categories = try await makeClient(transport).categories(matching: "mobile")

    #expect(categories.first?.imageURL == expected)
  }

  @Test("sans texte saisi, demande le début du catalogue sans paramètre q")
  func emptyQuery() async throws {
    let transport = FakeTransport(json: #"{"categories":[]}"#)

    let categories = try await makeClient(transport).categories(matching: "  ")

    #expect(categories.isEmpty)
    #expect(await transport.requests.first?.url == catalogURL)
  }

  @Test("tolère un champ ajouté à la catégorie et à la réponse (ADR 0024, §8)")
  func toleratesAddedFields() async throws {
    let transport = FakeTransport(json: #"{"categories":[\#(categoryJSON().dropLast()),"tags":["MOBA"]}],"total":1}"#)

    let categories = try await makeClient(transport).categories(matching: "mobile")

    #expect(categories.map(\.name) == ["Mobile Legends: Bang Bang"])
  }

  @Test("traduit une réponse d'erreur RFC 9457 en ServiceProblem")
  func translatesProblem() async throws {
    let transport = FakeTransport(status: 429, json: #"{"type":"about:blank","title":"Too Many Requests","status":429}"#)

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Too Many Requests", status: 429, detail: nil)) {
      try await makeClient(transport).categories(matching: "mobile")
    }
  }
}
