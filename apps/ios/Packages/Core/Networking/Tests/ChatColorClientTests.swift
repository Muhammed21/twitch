import Domain
import Foundation
import Networking
import Testing

private let now = Date(timeIntervalSince1970: 1_800_000_000)
private let chatColorURL = URL(string: "http://127.0.0.1:3000/v1/me/chat-color")!

private func meJSON(chatColor: String = "") -> String {
  #"{"id":"4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b","name":"Viewer de test","email":"viewer@twitch.local"\#(chatColor)}"#
}

@MainActor
private func makeClient(_ transport: FakeTransport) -> ChatColorClient {
  ChatColorClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport, tokens: FakeTokenProvider(), now: { now })
}

@MainActor
@Suite("Couleur du pseudo sur PUT /v1/me/chat-color")
struct ChatColorClientTests {
  @Test("envoie la couleur choisie avec le jeton")
  func sendsChosenColor() async throws {
    let transport = FakeTransport(json: meJSON(chatColor: ##","chatColor":"#2E8B57""##))

    try await makeClient(transport).setChatColor("#2E8B57")

    let request = try #require(await transport.requests.first)
    #expect(request.method == "PUT")
    #expect(request.url == chatColorURL)
    #expect(request.headers["Authorization"] == "Bearer access-1")
    let body = try #require(JSONSerialization.jsonObject(with: request.body) as? [String: String])
    #expect(body == ["chatColor": "#2E8B57"])
  }

  @Test("revenir à la couleur par défaut envoie un corps sans couleur")
  func sendsEmptyBodyForDefault() async throws {
    let transport = FakeTransport(json: meJSON())

    try await makeClient(transport).setChatColor(nil)

    let request = try #require(await transport.requests.first)
    #expect(request.method == "PUT")
    #expect(request.url == chatColorURL)
    let body = try #require(JSONSerialization.jsonObject(with: request.body) as? [String: String])
    #expect(body.isEmpty)
  }

  @Test("traduit un refus RFC 9457 (couleur invalide) en ServiceProblem")
  func translatesProblem() async throws {
    let transport = FakeTransport(
      status: 400,
      json: #"{"type":"about:blank","title":"Bad Request","status":400,"detail":"Couleur de pseudo invalide"}"#
    )

    await #expect(
      throws: ServiceProblem(type: "about:blank", title: "Bad Request", status: 400, detail: "Couleur de pseudo invalide")
    ) {
      try await makeClient(transport).setChatColor("#XYZ")
    }
  }
}

@Suite("Couleur du pseudo lue sur GET /v1/me")
struct AccountChatColorTests {
  @Test("lit la couleur du pseudo quand l'API la donne")
  func readsChatColor() async throws {
    let transport = FakeTransport(json: meJSON(chatColor: ##","chatColor":"#1E90FF""##))

    let account = try await AccountClient(
      apiBaseURL: devConfiguration.apiBaseURL, transport: transport, tokens: FakeTokenProvider(), now: { now }
    ).currentAccount()

    #expect(account.chatColor == "#1E90FF")
  }

  @Test("sans couleur choisie, le compte n'en a pas")
  func noChatColor() async throws {
    let account = try await AccountClient(
      apiBaseURL: devConfiguration.apiBaseURL, transport: FakeTransport(json: meJSON()), tokens: FakeTokenProvider(), now: { now }
    ).currentAccount()

    #expect(account.chatColor == nil)
  }
}
