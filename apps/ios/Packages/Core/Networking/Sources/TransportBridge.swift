import Foundation
import HTTPTypes
import OpenAPIRuntime

struct TransportBridge: ClientTransport {
  private static let maxBodyBytes = 1 << 20

  let transport: any HTTPTransport

  func send(
    _ request: HTTPTypes.HTTPRequest,
    body: HTTPBody?,
    baseURL: URL,
    operationID _: String
  ) async throws -> (HTTPTypes.HTTPResponse, HTTPBody?) {
    let payload = if let body {
      try await Data(collecting: body, upTo: Self.maxBodyBytes)
    } else {
      Data()
    }
    let response = try await transport.send(HTTPRequest(
      method: request.method.rawValue,
      url: Self.url(of: request, against: baseURL),
      headers: Dictionary(request.headerFields.map { ($0.name.rawName, $0.value) }) { "\($0), \($1)" },
      body: payload
    ))
    return (HTTPTypes.HTTPResponse(status: .init(code: response.status)), HTTPBody(response.body))
  }

  private static func url(of request: HTTPTypes.HTTPRequest, against baseURL: URL) throws -> URL {
    guard let url = URL(string: baseURL.absoluteString + (request.path ?? "")) else { throw URLError(.badURL) }
    return url
  }
}
