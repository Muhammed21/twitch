import Domain
import Foundation

public struct ChatSocketConnector: ChatConnector {
  private let chatBaseURL: URL
  private let session: URLSession

  public init(chatBaseURL: URL, session: URLSession = .shared) {
    self.chatBaseURL = chatBaseURL
    self.session = session
  }

  public func connect(accessToken: String) async throws -> any ChatConnection {
    let task = session.webSocketTask(with: Self.request(chatBaseURL: chatBaseURL, accessToken: accessToken))
    task.resume()
    return try await ChatSocket.open(
      socket: URLSessionWebSocket(task: task),
      ackTimeout: .seconds(10),
      sleep: { try await Task.sleep(for: $0) }
    )
  }

  static func request(chatBaseURL: URL, accessToken: String) -> URLRequest {
    var components = URLComponents(url: chatBaseURL, resolvingAgainstBaseURL: false)
    components?.scheme = chatBaseURL.scheme == "https" ? "wss" : "ws"
    components?.path = "/socket.io/"
    components?.queryItems = [URLQueryItem(name: "EIO", value: "4"), URLQueryItem(name: "transport", value: "websocket")]
    var request = URLRequest(url: components?.url ?? chatBaseURL)
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    return request
  }
}

enum SocketFailure {
  static func error(status: Int?, closeCode: URLSessionWebSocketTask.CloseCode) -> ChatConnectionError {
    switch (status, closeCode) {
    case (401, _): .unauthorized
    case (403, _): .forbidden
    case (_, .messageTooBig): .messageTooLarge
    default: .unavailable
    }
  }
}

struct URLSessionWebSocket: WebSocket {
  let task: URLSessionWebSocketTask

  func send(_ text: String) async throws {
    try await task.send(.string(text))
  }

  func receive() async throws -> String {
    let message: URLSessionWebSocketTask.Message
    do {
      message = try await task.receive()
    } catch {
      throw SocketFailure.error(status: (task.response as? HTTPURLResponse)?.statusCode, closeCode: task.closeCode)
    }
    guard case let .string(text) = message else {
      return ""
    }
    return text
  }

  func close() {
    task.cancel(with: .normalClosure, reason: nil)
  }
}
