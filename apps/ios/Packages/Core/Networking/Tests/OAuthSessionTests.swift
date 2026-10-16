import Domain
import Foundation
import Networking
import Testing

private let now = Date(timeIntervalSince1970: 1_800_000_000)
private let initial = TokenSet(accessToken: "access-1", refreshToken: "refresh-1", expiresAt: now + 900)
private let rotated = TokenSet(accessToken: "access-2", refreshToken: "refresh-2", expiresAt: now + 1800)
private let expired = now + 900

private struct Harness {
  let transport: FakeTransport
  let store: InMemoryTokenStore
  let session: OAuthSession

  init(tokens: TokenSet? = initial, transport: FakeTransport = FakeTransport(json: tokenJSON(access: "access-2", refresh: "refresh-2"))) {
    self.transport = transport
    store = InMemoryTokenStore(tokens)
    session = OAuthSession(endpoint: TokenEndpoint(configuration: devConfiguration, transport: transport), store: store)
  }

  func tokenCalls() async -> [HTTPRequest] {
    await transport.requests(to: tokenURL)
  }
}

private func gatedTransport(_ gate: Gate, json: String = tokenJSON(access: "access-2", refresh: "refresh-2"),
                            status: Int = 200) -> FakeTransport
{
  FakeTransport { _ in
    await gate.wait()
    return HTTPResponse(status: status, body: Data(json.utf8))
  }
}

private func concurrently(_ count: Int, gate: Gate,
                          _ call: @escaping @Sendable () async throws -> String) async -> [Result<String, SessionErrorBox>]
{
  await withTaskGroup(of: Result<String, SessionErrorBox>.self) { group in
    for _ in 0 ..< count {
      group.addTask {
        do { return try await .success(call()) } catch { return .failure(SessionErrorBox(error)) }
      }
    }
    try? await Task.sleep(for: .milliseconds(100))
    await gate.open()
    return await group.reduce(into: []) { $0.append($1) }
  }
}

private func firstUpdate(of session: OAuthSession) async -> SessionStatus? {
  await withTaskGroup(of: SessionStatus?.self) { group in
    group.addTask { await session.statusUpdates.first { _ in true } }
    group.addTask {
      try? await Task.sleep(for: .seconds(1))
      return nil
    }
    let first = await group.next() ?? nil
    group.cancelAll()
    return first
  }
}

private struct SessionErrorBox: Error, Equatable {
  let description: String
  init(_ error: any Error) {
    description = String(describing: error)
  }
}

@Suite("Session OAuth et rafraîchissement")
struct OAuthSessionTests {
  @Test("la connexion échange le code, garde les tokens et passe à l'état connecté")
  func signIn() async throws {
    let harness = Harness(tokens: nil, transport: FakeTransport(json: tokenJSON()))
    #expect(await harness.session.status() == .signedOut)

    try await harness.session.signIn(code: "code-1", verifier: "verifier-1", at: now)

    #expect(harness.store.tokens == initial)
    #expect(await harness.session.status() == .signedIn)
    #expect(await firstUpdate(of: harness.session) == .signedIn)
    #expect(try await form(of: #require(harness.tokenCalls().first))["code"] == "code-1")
  }

  @Test("sans tokens, demander un access token rend l'état déconnecté")
  func noTokens() async {
    let harness = Harness(tokens: nil)

    await #expect(throws: SessionError.signedOut) { try await harness.session.accessToken(at: now) }
    await #expect(throws: SessionError.signedOut) { try await harness.session.accessTokenRejected("x", at: now) }
  }

  @Test("rend l'access token gardé tant qu'il expire dans plus de 60 s, sans appel réseau")
  func validToken() async throws {
    let harness = Harness()

    #expect(try await harness.session.accessToken(at: expired - 61) == "access-1")
    #expect(await harness.tokenCalls().isEmpty)
  }

  @Test("rafraîchit 60 s avant l'expiration et garde les tokens tournés", arguments: [expired - 60, expired, expired + 3600])
  func refreshesWhenExpiring(instant: Date) async throws {
    let harness = Harness()

    #expect(try await harness.session.accessToken(at: instant) == "access-2")

    let calls = await harness.tokenCalls()
    try #require(calls.count == 1)
    #expect(form(of: calls[0])["refresh_token"] == "refresh-1")
    #expect(harness.store.tokens == TokenSet(accessToken: "access-2", refreshToken: "refresh-2", expiresAt: instant + 900))
  }

  @Test("dix requêtes qui reçoivent 401 en même temps déclenchent un seul rafraîchissement")
  func tenConcurrentRejections() async {
    let gate = Gate()
    let harness = Harness(transport: gatedTransport(gate))
    let session = harness.session

    let results = await concurrently(10, gate: gate) { try await session.accessTokenRejected("access-1", at: now) }

    #expect(results == Array(repeating: .success("access-2"), count: 10))
    #expect(await harness.tokenCalls().count == 1)
  }

  @Test("dix demandes concurrentes d'un token expiré déclenchent un seul rafraîchissement")
  func tenConcurrentExpiredReads() async {
    let gate = Gate()
    let harness = Harness(transport: gatedTransport(gate))
    let session = harness.session

    let results = await concurrently(10, gate: gate) { try await session.accessToken(at: expired) }

    #expect(results == Array(repeating: .success("access-2"), count: 10))
    #expect(await harness.tokenCalls().count == 1)
  }

  @Test("un 401 sur un token déjà remplacé rend le token courant sans rafraîchir")
  func staleRejection() async throws {
    let harness = Harness(tokens: rotated)

    #expect(try await harness.session.accessTokenRejected("access-1", at: now) == "access-2")
    #expect(await harness.tokenCalls().isEmpty)
  }

  @Test("invalid_grant efface les tokens, rend l'état déconnecté à tous les appels en attente et le publie")
  func invalidGrant() async {
    let gate = Gate()
    let harness = Harness(transport: gatedTransport(gate, json: #"{"error":"invalid_grant"}"#, status: 400))
    let session = harness.session

    let results = await concurrently(3, gate: gate) { try await session.accessTokenRejected("access-1", at: now) }

    let signedOut = Result<String, SessionErrorBox>.failure(SessionErrorBox(SessionError.signedOut))
    #expect(results == Array(repeating: signedOut, count: 3))
    #expect(await harness.tokenCalls().count == 1)
    #expect(harness.store.tokens == nil)
    #expect(await session.status() == .signedOut)
    #expect(await firstUpdate(of: session) == .signedOut)
  }

  @Test("une panne réseau pendant le rafraîchissement garde les tokens, et l'appel suivant réessaie")
  func networkFailure() async throws {
    let harness = Harness(transport: FakeTransport { _ in throw NetworkDown() })

    await #expect(throws: NetworkDown.self) { try await harness.session.accessToken(at: expired) }
    #expect(harness.store.tokens == initial)
    #expect(await harness.session.status() == .signedIn)

    await harness.transport.respond { _ in HTTPResponse(status: 200, body: Data(tokenJSON(access: "access-2").utf8)) }
    #expect(try await harness.session.accessToken(at: expired) == "access-2")
    #expect(await harness.tokenCalls().count == 2)
  }

  @Test("la déconnexion révoque le refresh token, puis vide le Keychain et publie l'état déconnecté")
  func signOut() async throws {
    let harness = Harness(transport: FakeTransport(json: "{}"))

    try await harness.session.signOut()

    let revocations = await harness.transport.requests(to: revokeURL)
    #expect(revocations.map { form(of: $0)["token"] } == ["refresh-1"])
    #expect(harness.store.tokens == nil)
    #expect(await harness.session.status() == .signedOut)
    #expect(await firstUpdate(of: harness.session) == .signedOut)
  }

  @Test("la déconnexion vide le Keychain même si la révocation échoue", arguments: [true, false])
  func signOutDespiteRevocationFailure(networkDown: Bool) async throws {
    let transport = networkDown
      ? FakeTransport { _ in throw NetworkDown() }
      : FakeTransport(status: 503, json: "indisponible")
    let harness = Harness(transport: transport)

    try await harness.session.signOut()

    #expect(await harness.transport.requests(to: revokeURL).count == 1)
    #expect(harness.store.tokens == nil)
  }

  @Test("la déconnexion attend le rafraîchissement en vol, révoque le token tourné, et refuse les demandes faites entre-temps")
  func signOutDuringRefresh() async throws {
    let gate = Gate()
    let transport = FakeTransport { request in
      guard request.url == tokenURL else { return HTTPResponse(status: 200, body: Data("{}".utf8)) }
      await gate.wait()
      return HTTPResponse(status: 200, body: Data(tokenJSON(access: "access-2", refresh: "refresh-2").utf8))
    }
    let harness = Harness(transport: transport)
    let session = harness.session

    let refresh = Task { try await session.accessToken(at: expired) }
    try await Task.sleep(for: .milliseconds(50))
    let signOut = Task { try await session.signOut() }
    try await Task.sleep(for: .milliseconds(50))
    let readDuringSignOut = Task { try await session.accessToken(at: now) }
    let rejectionDuringSignOut = Task { try await session.accessTokenRejected("access-2", at: now) }
    try await Task.sleep(for: .milliseconds(50))
    await gate.open()
    _ = try? await refresh.value
    try await signOut.value

    await #expect(throws: SessionError.signedOut) { try await readDuringSignOut.value }
    await #expect(throws: SessionError.signedOut) { try await rejectionDuringSignOut.value }

    let revocations = await harness.transport.requests(to: revokeURL)
    #expect(revocations.map { form(of: $0)["token"] } == ["refresh-2"])
    #expect(harness.store.tokens == nil)
  }

  @Test("fournit les access tokens au reste de l'app par le protocole du Domain")
  func conformsToDomainProtocol() async throws {
    let provider: any AccessTokenProvider = Harness().session

    #expect(try await provider.accessToken(at: now) == "access-1")
  }
}
