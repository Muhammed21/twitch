import Domain
import Foundation
import Networking
import Testing

private let now = Date(timeIntervalSince1970: 1_800_000_000)
private let channel = ChannelID(UUID(uuidString: "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69") ?? UUID())
private let viewer = UUID(uuidString: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b") ?? UUID()
private let timeoutsURL = URL(string: "http://127.0.0.1:3000/v1/channels/9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69/timeouts")
private let timeoutJSON =
  #"{"channelId":"9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69","userId":"4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b","expiresAt":"2027-01-15T08:10:00.000Z"}"#

private func makeClient(transport: FakeTransport) -> ModerationClient {
  ModerationClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport, tokens: FakeTokenProvider(), now: { now })
}

private func body(of request: HTTPRequest) throws -> [String: Any] {
  try #require(JSONSerialization.jsonObject(with: request.body) as? [String: Any])
}

@Suite("Timeout d'un viewer sur POST /v1/channels/{id}/timeouts")
struct ModerationClientTests {
  @Test("envoie le viewer et la durée en secondes, avec le jeton du propriétaire", arguments: [600, 60])
  func sendsTimeout(seconds: Int) async throws {
    let transport = FakeTransport(status: 201, json: timeoutJSON)

    try await makeClient(transport: transport).timeout(viewer, in: channel, for: .seconds(seconds))

    let request = try #require(await transport.requests.first)
    #expect(request.method == "POST")
    #expect(request.url == timeoutsURL)
    #expect(request.headers["Authorization"] == "Bearer access-1")
    let sent = try body(of: request)
    #expect((sent["userId"] as? String)?.lowercased() == viewer.uuidString.lowercased())
    #expect(sent["durationSeconds"] as? Int == seconds)
  }

  @Test("remonte le problème du serveur quand le timeout est refusé", arguments: [403, 404, 422])
  func refused(status: Int) async {
    let transport = FakeTransport(status: status, json: #"{"type":"about:blank","title":"Refus","status":\#(status)}"#)

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Refus", status: status, detail: nil)) {
      try await makeClient(transport: transport).timeout(viewer, in: channel, for: .seconds(600))
    }
  }
}
