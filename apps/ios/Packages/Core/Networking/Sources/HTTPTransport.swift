import Foundation

public struct HTTPRequest: Equatable, Sendable {
  public let method: String
  public let url: URL
  public let headers: [String: String]
  public let body: Data

  public init(method: String, url: URL, headers: [String: String], body: Data) {
    self.method = method
    self.url = url
    self.headers = headers
    self.body = body
  }
}

public struct HTTPResponse: Equatable, Sendable {
  public let status: Int
  public let body: Data

  public init(status: Int, body: Data) {
    self.status = status
    self.body = body
  }
}

public protocol HTTPTransport: Sendable {
  func send(_ request: HTTPRequest) async throws -> HTTPResponse
}

public struct URLSessionHTTPTransport: HTTPTransport {
  private let session: URLSession

  public init(session: URLSession = .shared) {
    self.session = session
  }

  public func send(_ request: HTTPRequest) async throws -> HTTPResponse {
    var urlRequest = URLRequest(url: request.url)
    urlRequest.httpMethod = request.method
    urlRequest.allHTTPHeaderFields = request.headers
    urlRequest.httpBody = request.body.isEmpty ? nil : request.body
    let (body, response) = try await session.data(for: urlRequest)
    guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    return HTTPResponse(status: response.statusCode, body: body)
  }
}
