import Foundation
import Networking
import Testing

private final class StreamProtocol: URLProtocol {
  override static func canInit(with _: URLRequest) -> Bool {
    true
  }

  override static func canonicalRequest(for request: URLRequest) -> URLRequest {
    request
  }

  override func startLoading() {
    let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: nil)!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    let accept = request.value(forHTTPHeaderField: "Accept") ?? ""
    client?.urlProtocol(self, didLoad: Data("accept: \(accept)\r\nevent: sta".utf8))
    client?.urlProtocol(self, didLoad: Data("tus\ndata: x\n\n".utf8))
    client?.urlProtocol(self, didLoad: Data([0xFF, 0x0A]))
    client?.urlProtocol(self, didLoad: Data("data: fin".utf8))
    client?.urlProtocolDidFinishLoading(self)
  }

  override func stopLoading() {}
}

private func streamingSession() -> URLSession {
  let configuration = URLSessionConfiguration.ephemeral
  configuration.protocolClasses = [StreamProtocol.self]
  return URLSession(configuration: configuration)
}

@Suite("Transport HTTP ligne à ligne sur URLSession")
struct URLSessionLineTransportTests {
  @Test("rend le statut puis les lignes reçues, vides comprises, sans fin de ligne ; un octet illisible devient U+FFFD")
  func streamsLines() async throws {
    let transport = URLSessionLineTransport(session: streamingSession())

    let response = try await transport.lines(HTTPRequest(
      method: "GET",
      url: #require(URL(string: "http://127.0.0.1:3000/v1/flux")),
      headers: ["Accept": "text/event-stream"],
      body: Data()
    ))
    let lines = try await response.lines.reduce(into: [String]()) { $0.append($1) }

    #expect(response.status == 200)
    #expect(lines == ["accept: text/event-stream", "event: status", "data: x", "", "\u{FFFD}", "data: fin"])
  }
}
