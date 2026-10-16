import Foundation
import Networking

actor FakeTransport: HTTPTransport {
  typealias Responder = @Sendable (HTTPRequest) async throws -> HTTPResponse

  private(set) var requests: [HTTPRequest] = []
  private var responder: Responder

  init(responder: @escaping Responder) {
    self.responder = responder
  }

  init(status: Int = 200, json: String) {
    self.init { _ in HTTPResponse(status: status, body: Data(json.utf8)) }
  }

  func respond(with responder: @escaping Responder) {
    self.responder = responder
  }

  func send(_ request: HTTPRequest) async throws -> HTTPResponse {
    requests.append(request)
    return try await responder(request)
  }

  func requests(to url: URL) -> [HTTPRequest] {
    requests.filter { $0.url == url }
  }
}

func form(of request: HTTPRequest) -> [String: String] {
  var components = URLComponents()
  components.percentEncodedQuery = String(bytes: request.body, encoding: .utf8)
  let items = components.queryItems ?? []
  return Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
}

func tokenJSON(access: String = "access-1", refresh: String = "refresh-1", expiresIn: Int = 900) -> String {
  #"{"access_token":"\#(access)","refresh_token":"\#(refresh)","expires_in":\#(expiresIn),"token_type":"Bearer"}"#
}

let devConfiguration = OAuthConfiguration(apiBaseURL: URL(string: "http://127.0.0.1:3000")!, clientID: "twitch-ios-dev")
let tokenURL = URL(string: "http://127.0.0.1:3000/auth/oauth2/token")!
let revokeURL = URL(string: "http://127.0.0.1:3000/auth/oauth2/revoke")!
