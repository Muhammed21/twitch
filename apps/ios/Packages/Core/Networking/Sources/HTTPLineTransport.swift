import Foundation

public struct HTTPLineResponse: Sendable {
  public let status: Int
  public let lines: AsyncThrowingStream<String, any Error>

  public init(status: Int, lines: AsyncThrowingStream<String, any Error>) {
    self.status = status
    self.lines = lines
  }
}

public protocol HTTPLineTransport: Sendable {
  func lines(_ request: HTTPRequest) async throws -> HTTPLineResponse
}

public struct URLSessionLineTransport: HTTPLineTransport {
  private static let newline = UInt8(ascii: "\n")
  private static let carriageReturn = UInt8(ascii: "\r")
  private static let replacement: Unicode.Scalar = "\u{FFFD}"

  private let session: URLSession

  public init(session: URLSession = .shared) {
    self.session = session
  }

  public func lines(_ request: HTTPRequest) async throws -> HTTPLineResponse {
    var urlRequest = URLRequest(url: request.url)
    urlRequest.httpMethod = request.method
    urlRequest.allHTTPHeaderFields = request.headers
    let (bytes, response) = try await session.bytes(for: urlRequest)
    guard let response = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    return HTTPLineResponse(status: response.statusCode, lines: Self.split(bytes))
  }

  private static func split(_ bytes: URLSession.AsyncBytes) -> AsyncThrowingStream<String, any Error> {
    AsyncThrowingStream { continuation in
      let reading = Task {
        do {
          var line: [UInt8] = []
          for try await byte in bytes {
            guard byte == newline else {
              line.append(byte)
              continue
            }
            continuation.yield(text(of: line))
            line = []
          }
          if !line.isEmpty { continuation.yield(text(of: line)) }
          continuation.finish()
        } catch {
          continuation.finish(throwing: error)
        }
      }
      continuation.onTermination = { _ in reading.cancel() }
    }
  }

  private static func text(of line: [UInt8]) -> String {
    let bytes = line.last == carriageReturn ? line.dropLast() : line[...]
    var scalars = String.UnicodeScalarView()
    _ = transcode(bytes.makeIterator(), from: UTF8.self, to: UTF32.self, stoppingOnError: false) { unit in
      scalars.append(Unicode.Scalar(unit) ?? replacement)
    }
    return String(scalars)
  }
}
