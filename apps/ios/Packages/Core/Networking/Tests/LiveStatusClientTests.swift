import Domain
import Foundation
import Networking
import Testing

private let channelID = ChannelID(UUID(uuidString: "0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d")!)
private let liveStatusURL = URL(string: "http://127.0.0.1:3000/v1/channels/0F5E2D7A-3C41-4B8E-9A6D-1E2F3A4B5C6D/live-status")!

private func statusLines(_ json: String) -> [String] {
  ["event: status", "data: \(json)", ""]
}

private let liveJSON = #"{"channelId":"0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d","live":true,"startedAt":"2026-11-03T20:00:00.000Z","viewerCount":42}"#
private let offlineJSON = #"{"channelId":"0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d","live":false}"#

private actor FakeLineTransport: HTTPLineTransport {
  private let status: Int
  private let script: [String]
  private(set) var requests: [HTTPRequest] = []

  init(status: Int = 200, lines: [String]) {
    self.status = status
    script = lines
  }

  func lines(_ request: HTTPRequest) async throws -> HTTPLineResponse {
    requests.append(request)
    let script = script
    return HTTPLineResponse(status: status, lines: AsyncThrowingStream { continuation in
      script.forEach { continuation.yield($0) }
      continuation.finish()
    })
  }
}

private func statuses(from transport: FakeLineTransport) async throws -> [LiveStatus] {
  let client = LiveStatusClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport)
  return try await client.statuses(of: channelID).reduce(into: []) { $0.append($1) }
}

@Suite("Statut du live sur le SSE GET /v1/channels/{channelId}/live-status")
struct LiveStatusClientTests {
  @Test("ouvre le flux sans jeton, en text/event-stream")
  func request() async throws {
    let transport = FakeLineTransport(lines: [])

    _ = try await statuses(from: transport)

    let request = try #require(await transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url == liveStatusURL)
    #expect(request.headers == ["Accept": "text/event-stream"])
  }

  @Test("traduit chaque événement status, live avec son compteur ou hors live")
  func decodesStatuses() async throws {
    let transport = FakeLineTransport(lines: statusLines(liveJSON) + statusLines(offlineJSON))

    #expect(try await statuses(from: transport) == [.live(viewers: ViewerCount(42)), .offline])
  }

  @Test("un live sans compteur garde un compteur inconnu")
  func liveWithoutCount() async throws {
    let json = #"{"channelId":"0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d","live":true}"#

    #expect(try await statuses(from: FakeLineTransport(lines: statusLines(json))) == [.live(viewers: nil)])
  }

  @Test("tolère un champ ajouté (ADR 0024, §8) et ignore les battements et les autres événements")
  func tolerant() async throws {
    let added = #"{"channelId":"0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d","live":false,"reason":"fin"}"#
    let transport = FakeLineTransport(lines: [": heartbeat", ""] + ["event: other", "data: {\"live\":true}", ""] + statusLines(added))

    #expect(try await statuses(from: transport) == [.offline])
  }

  @Test("écarte un statut illisible ou au compteur négatif sans couper le flux")
  func dropsMalformed() async throws {
    let negative = #"{"channelId":"0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d","live":true,"viewerCount":-1}"#
    let transport = FakeLineTransport(lines: statusLines("pas du json") + statusLines(negative) + statusLines(offlineJSON))

    #expect(try await statuses(from: transport) == [.offline])
  }

  @Test("un statut HTTP autre que 200 refuse le flux")
  func unavailable() async throws {
    let transport = FakeLineTransport(status: 503, lines: [])

    await #expect(throws: LiveStatusUnavailable(status: 503)) {
      try await statuses(from: transport)
    }
  }
}
