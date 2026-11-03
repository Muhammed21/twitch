@testable import ChatTransport
import Domain
import Foundation
import Testing

private let chatBaseURL = URL(string: "http://127.0.0.1:3001") ?? URL(fileURLWithPath: "/")

@Suite("Refus du handshake et fermetures traduits en erreurs du domaine (ADR 0023 §2)")
struct HandshakeTests {
  @Test(
    "le statut HTTP du handshake donne l'erreur du domaine",
    arguments: [
      (401, ChatConnectionError.unauthorized),
      (403, ChatConnectionError.forbidden),
      (404, ChatConnectionError.unavailable),
      (500, ChatConnectionError.unavailable),
      (101, ChatConnectionError.unavailable),
    ]
  )
  func status(code: Int, expected: ChatConnectionError) {
    #expect(SocketFailure.error(status: code, closeCode: .invalid) == expected)
  }

  @Test("sans réponse HTTP, le chat est indisponible")
  func noResponse() {
    #expect(SocketFailure.error(status: nil, closeCode: .invalid) == .unavailable)
  }

  @Test("une fermeture 1009 signale un message trop gros")
  func messageTooBig() {
    #expect(SocketFailure.error(status: 101, closeCode: .messageTooBig) == .messageTooLarge)
  }

  @Test("une autre fermeture rend le chat indisponible", arguments: [
    URLSessionWebSocketTask.CloseCode.normalClosure,
    .goingAway,
    .abnormalClosure,
  ])
  func otherClose(closeCode: URLSessionWebSocketTask.CloseCode) {
    #expect(SocketFailure.error(status: 101, closeCode: closeCode) == .unavailable)
  }
}

@Suite("Requête de connexion au chat")
struct ChatRequestTests {
  @Test("la requête vise /socket.io/ en WebSocket Engine.IO v4")
  func url() {
    let request = ChatSocketConnector.request(chatBaseURL: chatBaseURL, accessToken: "token-1")

    #expect(request.url?.absoluteString == "ws://127.0.0.1:3001/socket.io/?EIO=4&transport=websocket")
  }

  @Test("une base HTTPS donne une connexion WSS")
  func secure() {
    let base = URL(string: "https://chat.twitch.test") ?? chatBaseURL

    let request = ChatSocketConnector.request(chatBaseURL: base, accessToken: "token-1")

    #expect(request.url?.absoluteString == "wss://chat.twitch.test/socket.io/?EIO=4&transport=websocket")
  }

  @Test("le token part dans l'en-tête Authorization du handshake")
  func authorization() {
    let request = ChatSocketConnector.request(chatBaseURL: chatBaseURL, accessToken: "token-1")

    #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer token-1")
  }
}
