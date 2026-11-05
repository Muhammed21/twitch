import Domain
import Foundation
import Networking
import Testing

private let bootstrapURL = URL(string: "http://127.0.0.1:3000/v1/mobile/bootstrap")!

private let signedOut = FakeTokenProvider(failure: SessionError.signedOut)

private func makeClient(_ transport: FakeTransport, tokens: FakeTokenProvider = signedOut) -> BootstrapClient {
  BootstrapClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport, tokens: tokens, now: { Date(timeIntervalSince1970: 0) })
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

  @Test("connectée, la session présente son jeton : le serveur évalue les flags pour l'utilisateur")
  func authenticatedWhenSignedIn() async throws {
    let transport = FakeTransport(json: #"{"minSupportedVersion":"1.4.0","flags":{"session_replay":false}}"#)

    _ = try await makeClient(transport, tokens: FakeTokenProvider()).bootstrap()

    let request = try #require(await transport.requests.first)
    #expect(request.headers["Authorization"] == "Bearer access-1")
  }

  @Test("le jeton est indisponible (réseau) : le bootstrap part anonyme, le kill switch tient (ADR 0009)")
  func anonymousWhenTokenUnavailable() async throws {
    let transport = FakeTransport(json: #"{"minSupportedVersion":"1.4.0","flags":{"session_replay":false}}"#)
    let tokens = FakeTokenProvider(failure: URLError(.notConnectedToInternet))

    let bootstrap = try await makeClient(transport, tokens: tokens).bootstrap()

    #expect(try bootstrap.minSupportedVersion == AppVersion("1.4.0"))
    let request = try #require(await transport.requests.first)
    #expect(request.headers["Authorization"] == nil)
  }

  @Test("le renouvellement échoue après un 401 : le bootstrap repart anonyme")
  func anonymousWhenRenewalFails() async throws {
    let transport = FakeTransport { request in
      request.headers["Authorization"] == nil
        ? HTTPResponse(status: 200, body: Data(#"{"minSupportedVersion":"1.4.0","flags":{"session_replay":false}}"#.utf8))
        : HTTPResponse(status: 401, body: Data())
    }
    let tokens = FakeTokenProvider(renewalFailure: URLError(.timedOut))

    let bootstrap = try await makeClient(transport, tokens: tokens).bootstrap()

    #expect(try bootstrap.minSupportedVersion == AppVersion("1.4.0"))
    let last = try #require(await transport.requests.last)
    #expect(last.headers["Authorization"] == nil)
  }

  @Test("une annulation pendant l'obtention du jeton n'est pas rejouée en anonyme")
  func cancellationPropagates() async throws {
    let transport = FakeTransport(json: #"{"minSupportedVersion":"1.4.0","flags":{"session_replay":false}}"#)
    let tokens = FakeTokenProvider(failure: CancellationError())

    await #expect(throws: CancellationError.self) {
      try await makeClient(transport, tokens: tokens).bootstrap()
    }
    #expect(await transport.requests.isEmpty)
  }

  @Test("décode la variante du paywall évaluée par le serveur (ADR 0016)")
  func decodesPaywallVariant() async throws {
    let transport = FakeTransport(json: #"{"minSupportedVersion":"1.4.0","flags":{"session_replay":false,"exp_paywall_variant":"variant_b"}}"#)

    let bootstrap = try await makeClient(transport, tokens: FakeTokenProvider()).bootstrap()

    #expect(bootstrap.flags == FeatureFlags(sessionReplay: false, paywallVariant: "variant_b"))
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
