import Domain
import Foundation
import Networking
import Testing

private let now = Date(timeIntervalSince1970: 1_800_000_000)
private let headerURL = URL(string: "http://127.0.0.1:3000/v1/categories/just-chatting")!
private let notFoundJSON = #"{"type":"about:blank","title":"Not Found","status":404}"#

private func headerJSON(following: String = "") -> String {
  #"{"slug":"just-chatting","name":"Just Chatting","liveCount":3,"viewerCount":1200,"tags":["IRL","English"],"followerCount":41\#(following)}"#
}

private func makeClient(_ transport: FakeTransport, tokens: FakeTokenProvider = FakeTokenProvider()) -> CategoryDetailClient {
  CategoryDetailClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport, tokens: tokens, now: { now })
}

@Suite("En-tête d'une catégorie sur GET /v1/categories/{slug}, jeton facultatif")
struct CategoryDetailClientTests {
  @Test("connecté, envoie le jeton et lit tags, followers et suivi du compte")
  func signedIn() async throws {
    let transport = FakeTransport(json: headerJSON(following: #","isFollowing":true"#))

    let detail = try await makeClient(transport).detail(of: CategorySlug("just-chatting"))

    #expect(detail == CategoryDetail(tags: ["IRL", "English"], followers: 41, isFollowing: true))
    let request = try #require(await transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url == headerURL)
    #expect(request.headers["Authorization"] == "Bearer access-1")
  }

  @Test("sans compte, demande l'en-tête sans jeton et n'a pas d'état de suivi")
  func signedOut() async throws {
    let transport = FakeTransport(json: headerJSON())

    let detail = try await makeClient(transport, tokens: FakeTokenProvider(failure: .signedOut)).detail(of: CategorySlug("just-chatting"))

    #expect(detail == CategoryDetail(tags: ["IRL", "English"], followers: 41, isFollowing: nil))
    let request = try #require(await transport.requests.first)
    #expect(request.headers["Authorization"] == nil)
  }

  @Test("un jeton refusé est renouvelé une fois")
  func renewsToken() async throws {
    let transport = FakeTransport { request in
      request.headers["Authorization"] == "Bearer access-1"
        ? HTTPResponse(status: 401, body: Data(#"{"type":"about:blank","title":"Unauthorized","status":401}"#.utf8))
        : HTTPResponse(status: 200, body: Data(headerJSON(following: #","isFollowing":false"#).utf8))
    }

    let detail = try await makeClient(transport).detail(of: CategorySlug("just-chatting"))

    #expect(detail.isFollowing == false)
    #expect(await transport.requests.map { $0.headers["Authorization"] } == ["Bearer access-1", "Bearer access-2"])
  }

  @Test("une catégorie inconnue remonte son problème")
  func unknown() async throws {
    let client = makeClient(FakeTransport(status: 404, json: notFoundJSON))

    await #expect(throws: ServiceProblem.self) { try await client.detail(of: CategorySlug("just-chatting")) }
  }
}
