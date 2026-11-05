import Domain
import Foundation
import Networking
import Testing

private let now = Date(timeIntervalSince1970: 1_800_000_000)
private let meURL = URL(string: "http://127.0.0.1:3000/v1/me")!

private func makeClient(_ transport: FakeTransport) -> AccountClient {
  AccountClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport, tokens: FakeTokenProvider(), now: { now })
}

@Suite("Bio du compte sur PATCH /v1/me")
struct BioClientTests {
  @Test("envoie la bio avec le jeton et lit le compte rendu")
  func updatesBio() async throws {
    let transport = FakeTransport(
      json: #"{"id":"4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b","name":"Viewer de test","email":"viewer@twitch.local","bio":"i love do gaming stream"}"#
    )

    let account = try await makeClient(transport).updateBio("i love do gaming stream")

    #expect(account.bio == "i love do gaming stream")
    #expect(account.name == "Viewer de test")
    let request = try #require(await transport.requests.first)
    #expect(request.method == "PATCH")
    #expect(request.url == meURL)
    #expect(request.headers["Authorization"] == "Bearer access-1")
    let body = try #require(JSONSerialization.jsonObject(with: request.body) as? [String: String])
    #expect(body == ["bio": "i love do gaming stream"])
  }

  @Test("une bio vide efface la bio : le compte rendu n'en a plus")
  func clearsBio() async throws {
    let transport = FakeTransport(json: #"{"id":"4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b","name":"Viewer de test","email":"viewer@twitch.local"}"#)

    let account = try await makeClient(transport).updateBio("")

    #expect(account.bio == nil)
    let request = try #require(await transport.requests.first)
    let body = try #require(JSONSerialization.jsonObject(with: request.body) as? [String: String])
    #expect(body == ["bio": ""])
  }

  @Test("traduit un refus RFC 9457 (bio trop longue) en ServiceProblem")
  func translatesProblem() async throws {
    let transport = FakeTransport(status: 422, json: #"{"type":"about:blank","title":"Unprocessable Entity","status":422}"#)

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Unprocessable Entity", status: 422, detail: nil)) {
      try await makeClient(transport).updateBio(String(repeating: "a", count: 301))
    }
  }
}
