import Domain
import Foundation
import Networking
import Testing

private let channelID = ChannelID(UUID(uuidString: "0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d")!)
private let playbackURL = URL(string: "http://127.0.0.1:3000/v1/channels/0F5E2D7A-3C41-4B8E-9A6D-1E2F3A4B5C6D/playback")!
private let hlsURL = "http://127.0.0.1:3002/hls/channels/7c1d9e2a-4b3f-4a5e-8d6c-2f1e0a9b8c7d/master.m3u8"

private func makeClient(_ transport: FakeTransport) -> PlaybackClient {
  PlaybackClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport)
}

@Suite("URL de lecture sur GET /v1/channels/{channelId}/playback")
struct PlaybackClientTests {
  @Test("rend la playlist maître d'une chaîne en live, demandée sans jeton")
  func live() async throws {
    let transport = FakeTransport(json: #"{"playbackUrl":"\#(hlsURL)"}"#)

    let url = try await makeClient(transport).playbackURL(for: channelID)

    #expect(url == URL(string: hlsURL))
    let request = try #require(await transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url == playbackURL)
    #expect(request.headers["Authorization"] == nil)
  }

  @Test("tolère un champ ajouté à la réponse (ADR 0024, §8)")
  func toleratesAddedFields() async throws {
    let transport = FakeTransport(json: #"{"playbackUrl":"\#(hlsURL)","expiresAt":"demain"}"#)

    #expect(try await makeClient(transport).playbackURL(for: channelID) == URL(string: hlsURL))
  }

  @Test("refuse une URL de lecture vide")
  func rejectsEmptyURL() async throws {
    let transport = FakeTransport(json: #"{"playbackUrl":""}"#)

    await #expect(throws: DecodingError.self) {
      try await makeClient(transport).playbackURL(for: channelID)
    }
  }

  @Test("lit un 404 comme une chaîne hors live")
  func offline() async throws {
    let transport = FakeTransport(
      status: 404,
      json: #"{"type":"about:blank","title":"Chaîne hors live","status":404}"#
    )

    #expect(try await makeClient(transport).playbackURL(for: channelID) == nil)
  }

  @Test("traduit une autre erreur RFC 9457 en ServiceProblem")
  func translatesProblem() async throws {
    let transport = FakeTransport(
      status: 503,
      json: #"{"type":"about:blank","title":"Service Unavailable","status":503}"#
    )

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Service Unavailable", status: 503, detail: nil)) {
      try await makeClient(transport).playbackURL(for: channelID)
    }
  }
}
