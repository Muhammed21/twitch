public struct ClientVersionTransport: HTTPTransport {
  private static let header = "X-Client-Version"

  private let inner: any HTTPTransport
  private let version: String

  public init(wrapping inner: any HTTPTransport, version: String) {
    self.inner = inner
    self.version = version
  }

  public func send(_ request: HTTPRequest) async throws -> HTTPResponse {
    try await inner.send(HTTPRequest(
      method: request.method,
      url: request.url,
      headers: request.headers.merging([Self.header: version]) { _, new in new },
      body: request.body
    ))
  }
}
