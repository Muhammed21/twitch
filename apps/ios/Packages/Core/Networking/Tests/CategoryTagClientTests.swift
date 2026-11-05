import Domain
import Foundation
import Networking
import Testing

private let tagsURL = URL(string: "http://127.0.0.1:3000/v1/tags")!

private func makeClient(_ transport: FakeTransport) -> CategoryTagClient {
  CategoryTagClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport)
}

@Suite("Tags des catégories actives sur GET /v1/tags (ADR 0050, ADR 0051)")
struct CategoryTagClientTests {
  @Test("demande les tags sans authentification et les garde dans l'ordre du serveur, casse comprise")
  func lists() async throws {
    let transport = FakeTransport(json: #"{"items":[{"name":"Shooter","categoryCount":2},{"name":"FPS","categoryCount":1}]}"#)

    let tags = try await makeClient(transport).tags()

    #expect(tags == [InterestTag(name: "Shooter", categoryCount: 2), InterestTag(name: "FPS", categoryCount: 1)])
    let request = try #require(await transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url == tagsURL)
    #expect(request.headers["Authorization"] == nil)
  }

  @Test("une liste vide reste vide")
  func empty() async throws {
    let tags = try await makeClient(FakeTransport(json: #"{"items":[]}"#)).tags()

    #expect(tags.isEmpty)
  }

  @Test("tolère un champ ajouté au tag et à la liste (ADR 0024, §8)")
  func toleratesAddedFields() async throws {
    let transport = FakeTransport(json: #"{"items":[{"name":"FPS","categoryCount":1,"slug":"fps"}],"total":1}"#)

    let tags = try await makeClient(transport).tags()

    #expect(tags == [InterestTag(name: "FPS", categoryCount: 1)])
  }

  @Test("traduit une réponse d'erreur RFC 9457 en ServiceProblem")
  func translatesProblem() async throws {
    let transport = FakeTransport(status: 503, json: #"{"type":"about:blank","title":"Service Unavailable","status":503}"#)

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Service Unavailable", status: 503, detail: nil)) {
      try await makeClient(transport).tags()
    }
  }
}
