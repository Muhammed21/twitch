import Foundation
import Networking
import Testing

@Suite("En-tête X-Client-Version (ADR 0009)")
struct ClientVersionTransportTests {
  @Test("pose la version de l'app sur chaque requête et garde les autres en-têtes")
  func addsHeader() async throws {
    let inner = FakeTransport(status: 204, json: "")
    let transport = ClientVersionTransport(wrapping: inner, version: "0.1.0")
    let request = HTTPRequest(
      method: "POST",
      url: tokenURL,
      headers: ["Content-Type": "application/x-www-form-urlencoded"],
      body: Data("grant_type=refresh_token".utf8)
    )

    let response = try await transport.send(request)

    #expect(response == HTTPResponse(status: 204, body: Data()))
    let sent = try #require(await inner.requests.first)
    #expect(sent.headers == ["Content-Type": "application/x-www-form-urlencoded", "X-Client-Version": "0.1.0"])
    #expect(sent.method == request.method)
    #expect(sent.url == request.url)
    #expect(sent.body == request.body)
  }

  @Test("remplace une version déjà posée")
  func replacesHeader() async throws {
    let inner = FakeTransport(json: "{}")
    let transport = ClientVersionTransport(wrapping: inner, version: "0.2.0")

    _ = try await transport.send(HTTPRequest(method: "GET", url: tokenURL, headers: ["X-Client-Version": "9.9.9"], body: Data()))

    #expect(await inner.requests.first?.headers == ["X-Client-Version": "0.2.0"])
  }
}
