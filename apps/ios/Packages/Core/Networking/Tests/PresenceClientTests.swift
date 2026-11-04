import Domain
import Foundation
import Networking
import Testing

private let now = Date(timeIntervalSince1970: 1_800_000_000)
private let channel = ChannelID(UUID(uuidString: "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69") ?? UUID())
private let presenceURL = URL(string: "http://127.0.0.1:3000/v1/channels/9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69/presence")

private func makeClient(transport: FakeTransport, tokens: FakeTokenProvider = FakeTokenProvider()) -> PresenceClient {
  PresenceClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport, tokens: tokens, now: { now })
}

@Suite("Présence d'un viewer sur POST /v1/channels/{id}/presence")
struct PresenceClientTests {
  @Test("signale la présence sur la chaîne avec le jeton du compte, qui désigne le viewer")
  func reportsPresence() async throws {
    let transport = FakeTransport(status: 204, json: "")

    try await makeClient(transport: transport).reportPresence(in: channel)

    let request = try #require(await transport.requests.first)
    #expect(request.method == "POST")
    #expect(request.url == presenceURL)
    #expect(request.headers["Authorization"] == "Bearer access-1")
    let sent = try #require(JSONSerialization.jsonObject(with: request.body) as? [String: Any])
    #expect(sent.isEmpty)
  }

  @Test("remonte le refus du serveur, limite de débit comprise", arguments: [429, 404, 503])
  func refused(status: Int) async {
    let transport = FakeTransport(status: status, json: #"{"type":"about:blank","title":"Refus","status":\#(status)}"#)

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Refus", status: status, detail: nil)) {
      try await makeClient(transport: transport).reportPresence(in: channel)
    }
  }

  @Test("n'envoie rien sans session")
  func signedOut() async {
    let transport = FakeTransport(status: 204, json: "")

    await #expect(throws: SessionError.signedOut) {
      try await makeClient(transport: transport, tokens: FakeTokenProvider(failure: .signedOut)).reportPresence(in: channel)
    }
    #expect(await transport.requests.isEmpty)
  }
}
