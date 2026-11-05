import Domain
import Foundation
import Networking
import os
import Testing

private let now = Date(timeIntervalSince1970: 1_800_000_000)
private let meURL = URL(string: "http://127.0.0.1:3000/v1/me")!
private let viewer = Account(
  id: UUID(uuidString: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b")!,
  name: "Viewer de test",
  email: "viewer@twitch.local"
)

private func meJSON(extraFields: String = "") -> String {
  #"{"id":"4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b","name":"Viewer de test","email":"viewer@twitch.local"\#(extraFields)}"#
}

private func respondingInTurn(_ statuses: Int...) -> FakeTransport {
  let remaining = OSAllocatedUnfairLock(initialState: statuses)
  return FakeTransport { _ in
    let status = remaining.withLock { $0.isEmpty ? 200 : $0.removeFirst() }
    return HTTPResponse(status: status, body: Data((status == 200 ? meJSON() : unauthorizedJSON).utf8))
  }
}

private let unauthorizedJSON = #"{"type":"about:blank","title":"Unauthorized","status":401}"#

private func makeClient(transport: FakeTransport, tokens: FakeTokenProvider = FakeTokenProvider()) -> AccountClient {
  AccountClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport, tokens: tokens, now: { now })
}

@Suite("Compte courant sur GET /v1/me")
struct AccountClientTests {
  @Test("décode le compte d'une réponse réelle de GET /v1/me")
  func decodesRealResponse() async throws {
    let transport = FakeTransport(json: meJSON())

    let account = try await makeClient(transport: transport).currentAccount()

    #expect(account == viewer)
    let request = try #require(await transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url == meURL)
  }

  @Test("lit la bio et la date du dernier live quand l'API les donne")
  func readsBioAndLastLive() async throws {
    let transport = FakeTransport(json: meJSON(extraFields: #","bio":"i love do gaming stream","lastLiveAt":"2026-11-03T18:30:00.5Z""#))

    let account = try await makeClient(transport: transport).currentAccount()

    #expect(account.bio == "i love do gaming stream")
    let lastLive = try #require(account.lastLiveAt)
    #expect(abs(lastLive.timeIntervalSince1970 - 1_793_730_600.5) < 0.000_5)
  }

  @Test("sans bio ni dernier live, les deux restent absents")
  func noBioNorLastLive() async throws {
    let account = try await makeClient(transport: FakeTransport(json: meJSON())).currentAccount()

    #expect(account.bio == nil)
    #expect(account.lastLiveAt == nil)
    #expect(account.avatarURL == nil)
  }

  @Test("lit l'adresse de l'avatar quand l'API la donne")
  func readsAvatar() async throws {
    let transport = FakeTransport(json: meJSON(extraFields: #","avatarUrl":"https://cdn.twitch.local/avatars/viewer.jpg""#))

    let account = try await makeClient(transport: transport).currentAccount()

    #expect(account.avatarURL == URL(string: "https://cdn.twitch.local/avatars/viewer.jpg"))
  }

  @Test("ignore une adresse d'avatar qui n'est pas http ou https")
  func ignoresForeignAvatar() async throws {
    let transport = FakeTransport(json: meJSON(extraFields: #","avatarUrl":"file:///etc/passwd""#))

    let account = try await makeClient(transport: transport).currentAccount()

    #expect(account.avatarURL == nil)
  }

  @Test("tolère un champ ajouté par le serveur (ADR 0024, §8)")
  func toleratesAddedField() async throws {
    let transport = FakeTransport(json: meJSON(extraFields: #","avatar":{"url":"https://cdn.twitch.local/a.png"}"#))

    let account = try await makeClient(transport: transport).currentAccount()

    #expect(account == viewer)
  }

  @Test("refuse un identifiant de compte qui n'est pas un UUID (ADR 0024, §6)")
  func rejectsMalformedID() async throws {
    let transport = FakeTransport(json: #"{"id":"viewer-1","name":"Viewer de test","email":"viewer@twitch.local"}"#)

    await #expect(throws: DecodingError.self) {
      try await makeClient(transport: transport).currentAccount()
    }
  }

  @Test("présente le token d'accès courant en en-tête Bearer, obtenu à l'instant de l'horloge")
  func sendsBearerToken() async throws {
    let transport = FakeTransport(json: meJSON())
    let tokens = FakeTokenProvider(current: "access-1")

    _ = try await makeClient(transport: transport, tokens: tokens).currentAccount()

    let request = try #require(await transport.requests.first)
    #expect(request.headers["Authorization"] == "Bearer access-1")
    #expect(await tokens.instants == [now])
  }

  @Test("sur 401, signale le token rejeté puis réessaie une fois avec le token renouvelé")
  func retriesOnceAfterRejection() async throws {
    let transport = respondingInTurn(401, 200)
    let tokens = FakeTokenProvider(current: "access-1", renewed: "access-2")

    let account = try await makeClient(transport: transport, tokens: tokens).currentAccount()

    #expect(account == viewer)
    #expect(await tokens.rejected == ["access-1"])
    #expect(await tokens.instants == [now, now])
    #expect(await transport.requests.map { $0.headers["Authorization"] } == ["Bearer access-1", "Bearer access-2"])
  }

  @Test("deux 401 de suite remontent une erreur de session, sans troisième tentative")
  func secondRejectionEndsTheSession() async throws {
    let transport = respondingInTurn(401, 401, 200)
    let tokens = FakeTokenProvider()

    await #expect(throws: SessionError.signedOut) {
      try await makeClient(transport: transport, tokens: tokens).currentAccount()
    }
    #expect(await transport.requests.count == 2)
    #expect(await tokens.rejected == ["access-1"])
  }

  @Test("une session déconnectée remonte SessionError.signedOut sans appel réseau")
  func signedOutSessionSendsNothing() async throws {
    let transport = FakeTransport(json: meJSON())

    await #expect(throws: SessionError.signedOut) {
      try await makeClient(transport: transport, tokens: FakeTokenProvider(failure: .signedOut)).currentAccount()
    }
    #expect(await transport.requests.isEmpty)
  }

  @Test("une réponse d'erreur RFC 9457 devient un ServiceProblem, sans type généré")
  func serverErrorSurfacesItsProblem() async throws {
    let transport = FakeTransport(status: 500, json: #"{"type":"about:blank","title":"Internal Server Error","status":500}"#)

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Internal Server Error", status: 500, detail: nil)) {
      try await makeClient(transport: transport).currentAccount()
    }
  }

  @Test("une panne du transport remonte telle quelle")
  func transportFailureSurfacesAsIs() async throws {
    let transport = FakeTransport { _ in throw NetworkDown() }

    await #expect(throws: NetworkDown.self) {
      try await makeClient(transport: transport).currentAccount()
    }
  }
}
