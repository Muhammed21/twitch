import Domain
import Foundation

public struct LiveStatusClient: LiveStatusSource {
  private static let streaming = 200
  private static let statusEvent = "status"

  private struct Payload: Decodable {
    let live: Bool
    let viewerCount: Int?
  }

  private let apiBaseURL: URL
  private let transport: any HTTPLineTransport

  public init(apiBaseURL: URL, transport: any HTTPLineTransport) {
    self.apiBaseURL = apiBaseURL
    self.transport = transport
  }

  public func statuses(of channel: ChannelID) async throws -> AsyncThrowingStream<LiveStatus, any Error> {
    let url = apiBaseURL.appending(path: "v1/channels/\(channel.rawValue.uuidString)/live-status")
    let response = try await transport.lines(
      HTTPRequest(method: "GET", url: url, headers: ["Accept": "text/event-stream"], body: Data())
    )
    guard response.status == Self.streaming else { throw LiveStatusUnavailable(status: response.status) }
    return Self.decode(response.lines)
  }

  private static func decode(_ lines: AsyncThrowingStream<String, any Error>) -> AsyncThrowingStream<LiveStatus, any Error> {
    AsyncThrowingStream { continuation in
      let reading = Task {
        do {
          var parser = ServerSentEventParser()
          for try await line in lines {
            guard let event = parser.feed(line), event.name == statusEvent, let status = status(in: event.data) else {
              continue
            }
            continuation.yield(status)
          }
          continuation.finish()
        } catch {
          continuation.finish(throwing: error)
        }
      }
      continuation.onTermination = { _ in reading.cancel() }
    }
  }

  private static func status(in data: String) -> LiveStatus? {
    guard let payload = try? JSONDecoder().decode(Payload.self, from: Data(data.utf8)) else { return nil }
    guard payload.live else { return .offline }
    guard let count = payload.viewerCount else { return .live(viewers: nil) }
    return (try? ViewerCount(count)).map { .live(viewers: $0) }
  }
}
