import Domain
import Foundation
import Networking
import Testing

private let bootstrapURL = URL(string: "http://127.0.0.1:3000/v1/mobile/bootstrap")!

private func makeClient(_ transport: FakeTransport) -> BootstrapClient {
  BootstrapClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport)
}

@Suite("Bootstrap sur GET /v1/mobile/bootstrap")
struct BootstrapClientTests {
  @Test("décode la version minimale et les flags d'une réponse réelle, sans en-tête Authorization")
  func decodesRealResponse() async throws {
    let transport = FakeTransport(json: #"{"minSupportedVersion":"1.4.0","flags":{"session_replay":true}}"#)

    let bootstrap = try await makeClient(transport).bootstrap()

    #expect(try bootstrap == AppBootstrap(minSupportedVersion: AppVersion("1.4.0"), flags: FeatureFlags(sessionReplay: true)))
    let request = try #require(await transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url == bootstrapURL)
    #expect(request.headers["Authorization"] == nil)
  }

  @Test("tolère le profil, un flag et un champ ajoutés (ADR 0024, §8)")
  func toleratesAddedFields() async throws {
    let transport = FakeTransport(json: #"""
    {"minSupportedVersion":"1.4.0","flags":{"session_replay":false,"new_flag":"on"},
     "profile":{"id":"4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b","name":"Viewer","email":"v@twitch.local"},"motd":"hi"}
    """#)

    let bootstrap = try await makeClient(transport).bootstrap()

    #expect(bootstrap.flags == FeatureFlags(sessionReplay: false))
  }

  @Test("refuse une version minimale mal formée")
  func rejectsMalformedVersion() async throws {
    let transport = FakeTransport(json: #"{"minSupportedVersion":"1.4","flags":{"session_replay":false}}"#)

    await #expect(throws: AppVersionError.malformed("1.4")) {
      try await makeClient(transport).bootstrap()
    }
  }

  @Test("traduit une réponse d'erreur RFC 9457 en ServiceProblem")
  func translatesProblem() async throws {
    let transport = FakeTransport(
      status: 503,
      json: #"{"type":"about:blank","title":"Service Unavailable","status":503,"detail":"maintenance","correlationId":"c-1"}"#
    )

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Service Unavailable", status: 503, detail: "maintenance")) {
      try await makeClient(transport).bootstrap()
    }
  }
}
