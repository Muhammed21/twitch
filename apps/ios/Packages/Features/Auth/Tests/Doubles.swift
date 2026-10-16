import Auth
import CryptoKit
import Domain
import Foundation
import Networking
import os

let now = Date(timeIntervalSince1970: 1_800_000_000)
let storedTokens = TokenSet(accessToken: "access-1", refreshToken: "refresh-1", expiresAt: now + 900)
let viewer = Account(id: UUID(uuidString: "6F9619FF-8B86-D011-B42D-00C04FC964FF")!, name: "viewer_dev", email: "viewer@twitch.local")
let configuration = OAuthConfiguration(apiBaseURL: URL(string: "http://127.0.0.1:3000")!, clientID: "twitch-ios-dev")
let tokenURL = URL(string: "http://127.0.0.1:3000/auth/oauth2/token")!
let revokeURL = URL(string: "http://127.0.0.1:3000/auth/oauth2/revoke")!
let sequentialRandomBytes: PKCE.RandomBytes = {
  let draws = OSAllocatedUnfairLock(initialState: UInt8(0))
  return { count in
    let draw = draws.withLock { value in
      value &+= 1
      return value
    }
    return Array(repeating: draw, count: count)
  }
}()

struct KeychainUnavailable: Error {}

struct InMemoryTokenStore: TokenStore {
  private let state: OSAllocatedUnfairLock<TokenSet?>
  private let clearFails: Bool

  init(_ tokens: TokenSet?, clearFails: Bool = false) {
    state = OSAllocatedUnfairLock(initialState: tokens)
    self.clearFails = clearFails
  }

  var tokens: TokenSet? { state.withLock { $0 } }

  func load() throws -> TokenSet? {
    tokens
  }

  func save(_ tokens: TokenSet) throws {
    state.withLock { $0 = tokens }
  }

  func clear() throws {
    guard !clearFails else { throw KeychainUnavailable() }
    state.withLock { $0 = nil }
  }
}

actor FakeTransport: HTTPTransport {
  private(set) var requests: [HTTPRequest] = []
  private var response: HTTPResponse

  init(status: Int = 200, json: String = tokenJSON) {
    response = HTTPResponse(status: status, body: Data(json.utf8))
  }

  func respond(status: Int, json: String) {
    response = HTTPResponse(status: status, body: Data(json.utf8))
  }

  func send(_ request: HTTPRequest) async throws -> HTTPResponse {
    requests.append(request)
    return response
  }

  func requests(to url: URL) -> [HTTPRequest] {
    requests.filter { $0.url == url }
  }
}

let tokenJSON = #"{"access_token":"access-1","refresh_token":"refresh-1","expires_in":900,"token_type":"Bearer"}"#
let invalidGrantJSON = #"{"error":"invalid_grant"}"#

func form(of request: HTTPRequest) -> [String: String] {
  var components = URLComponents()
  components.percentEncodedQuery = String(bytes: request.body, encoding: .utf8)
  return Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") })
}

func query(of url: URL) -> [String: String] {
  let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
  return Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
}

struct FakeAccounts: AccountRepository {
  let result: Result<Account, any Error>
  let gate: Gate?

  func currentAccount() async throws -> Account {
    await gate?.wait()
    return try result.get()
  }
}

actor Gate {
  private var isOpen = false
  private var waiters: [CheckedContinuation<Void, Never>] = []

  func wait() async {
    guard !isOpen else { return }
    await withCheckedContinuation { waiters.append($0) }
  }

  func open() {
    isOpen = true
    waiters.forEach { $0.resume() }
    waiters = []
  }
}

func challenge(of verifier: String) -> String {
  Data(SHA256.hash(data: Data(verifier.utf8))).base64EncodedString()
    .replacingOccurrences(of: "+", with: "-")
    .replacingOccurrences(of: "/", with: "_")
    .replacingOccurrences(of: "=", with: "")
}

struct NetworkDown: Error {}

@MainActor
final class FakeWebAuthenticator: WebAuthenticator {
  typealias Reply = @MainActor (URL) async throws -> URL

  private(set) var requests: [(url: URL, callbackScheme: String)] = []
  private let reply: Reply

  init(reply: @escaping Reply) {
    self.reply = reply
  }

  func authenticate(at url: URL, callbackScheme: String) async throws -> URL {
    requests.append((url, callbackScheme))
    return try await reply(url)
  }
}

func callback(_ parameters: [String: String]) -> URL {
  var components = URLComponents(string: "twitch://oauth/callback")!
  components.queryItems = parameters.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
  return components.url!
}

let approved: FakeWebAuthenticator.Reply = { url in
  callback(["code": "code-1", "state": query(of: url)["state"] ?? ""])
}

let canceled: FakeWebAuthenticator.Reply = { _ in throw WebAuthenticationError.canceled }

@MainActor
struct Harness {
  let transport: FakeTransport
  let tokens: InMemoryTokenStore
  let session: OAuthSession
  let authenticator: FakeWebAuthenticator
  let store: SessionStore

  init(
    tokens stored: TokenSet? = nil,
    clearFails: Bool = false,
    reply: @escaping FakeWebAuthenticator.Reply = approved,
    account: Result<Account, any Error> = .success(viewer),
    accountGate: Gate? = nil
  ) {
    transport = FakeTransport()
    tokens = InMemoryTokenStore(stored, clearFails: clearFails)
    session = OAuthSession(endpoint: TokenEndpoint(configuration: configuration, transport: transport), store: tokens)
    authenticator = FakeWebAuthenticator(reply: reply)
    store = SessionStore(
      configuration: configuration,
      session: session,
      accounts: FakeAccounts(result: account, gate: accountGate),
      authenticator: authenticator,
      randomBytes: sequentialRandomBytes,
      now: { now }
    )
  }

  func launch() async -> Task<Void, Never> {
    let task = Task { await store.run() }
    _ = await eventually { store.phase != .launching }
    return task
  }

  func tokenCalls() async -> [HTTPRequest] {
    await transport.requests(to: tokenURL)
  }

  func revokeCalls() async -> [HTTPRequest] {
    await transport.requests(to: revokeURL)
  }
}

@MainActor
func eventually(_ condition: @MainActor () -> Bool) async -> Bool {
  for _ in 0 ..< 200 {
    if condition() { return true }
    try? await Task.sleep(for: .milliseconds(5))
  }
  return condition()
}
