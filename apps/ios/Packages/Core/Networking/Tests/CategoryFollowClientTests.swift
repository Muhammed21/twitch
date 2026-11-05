import Domain
import Foundation
import Networking
import Testing

private let now = Date(timeIntervalSince1970: 1_800_000_000)
private let followURL = URL(string: "http://127.0.0.1:3000/v1/me/followed-categories/just-chatting")!

private func makeClient(_ transport: FakeTransport) -> CategoryFollowClient {
  CategoryFollowClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport, tokens: FakeTokenProvider(), now: { now })
}

@Suite("Suivre une catégorie par PUT et DELETE /v1/me/followed-categories/{slug}")
struct CategoryFollowClientTests {
  @Test("suivre envoie PUT avec le jeton, sans corps ; 204 suffit")
  func follows() async throws {
    let transport = FakeTransport(status: 204, json: "")

    try await makeClient(transport).follow(CategorySlug("just-chatting"))

    let request = try #require(await transport.requests.first)
    #expect(request.method == "PUT")
    #expect(request.url == followURL)
    #expect(request.headers["Authorization"] == "Bearer access-1")
    #expect(request.body.isEmpty)
  }

  @Test("ne plus suivre envoie DELETE avec le jeton ; 204 suffit")
  func unfollows() async throws {
    let transport = FakeTransport(status: 204, json: "")

    try await makeClient(transport).unfollow(CategorySlug("just-chatting"))

    let request = try #require(await transport.requests.first)
    #expect(request.method == "DELETE")
    #expect(request.url == followURL)
    #expect(request.headers["Authorization"] == "Bearer access-1")
  }

  @Test("une catégorie inconnue ou retirée (404) est un ServiceProblem")
  func unknownCategory() async throws {
    let transport = FakeTransport(status: 404, json: #"{"type":"about:blank","title":"Not Found","status":404}"#)

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Not Found", status: 404, detail: nil)) {
      try await makeClient(transport).follow(CategorySlug("retiree"))
    }
  }
}
