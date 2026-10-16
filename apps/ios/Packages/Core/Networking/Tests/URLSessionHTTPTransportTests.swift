import Foundation
import Networking
import Testing

private final class EchoProtocol: URLProtocol {
  override static func canInit(with _: URLRequest) -> Bool {
    true
  }

  override static func canonicalRequest(for request: URLRequest) -> URLRequest {
    request
  }

  override func startLoading() {
    let echo = [
      request.httpMethod ?? "",
      request.url?.absoluteString ?? "",
      request.value(forHTTPHeaderField: "X-Probe") ?? "",
      String(bytes: Self.body(of: request), encoding: .utf8) ?? "",
    ].joined(separator: "\n")
    let response = HTTPURLResponse(url: request.url!, statusCode: 418, httpVersion: "HTTP/1.1", headerFields: nil)!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data(echo.utf8))
    client?.urlProtocolDidFinishLoading(self)
  }

  override func stopLoading() {}

  private static func body(of request: URLRequest) -> Data {
    guard let stream = request.httpBodyStream else { return request.httpBody ?? Data() }
    stream.open()
    defer { stream.close() }
    var data = Data()
    var buffer = [UInt8](repeating: 0, count: 1024)
    while stream.hasBytesAvailable {
      let count = stream.read(&buffer, maxLength: buffer.count)
      guard count > 0 else { break }
      data.append(buffer, count: count)
    }
    return data
  }
}

private func echoingSession() -> URLSession {
  let configuration = URLSessionConfiguration.ephemeral
  configuration.protocolClasses = [EchoProtocol.self]
  return URLSession(configuration: configuration)
}

@Suite("Transport HTTP sur URLSession")
struct URLSessionHTTPTransportTests {
  @Test("envoie la méthode, l'URL, les en-têtes et le corps, et rend le statut et le corps reçus")
  func sendsRequestAndReturnsResponse() async throws {
    let transport = URLSessionHTTPTransport(session: echoingSession())

    let response = try await transport.send(HTTPRequest(
      method: "POST",
      url: #require(URL(string: "http://127.0.0.1:3000/v1/echo")),
      headers: ["X-Probe": "sonde-1"],
      body: Data("corps-1".utf8)
    ))

    #expect(response.status == 418)
    #expect(String(bytes: response.body, encoding: .utf8) == "POST\nhttp://127.0.0.1:3000/v1/echo\nsonde-1\ncorps-1")
  }
}
