@testable import ChatTransport
import Domain
import Foundation
import Testing

private struct Fixture {
  let chatBaseURL: URL
  let channel: ChannelID
  let token: String
  let expiredToken: String
  let revokedToken: String

  static let current: Fixture? = {
    let environment = ProcessInfo.processInfo.environment
    guard
      let url = environment["CHAT_FIXTURE_URL"].flatMap(URL.init(string:)),
      let channel = environment["CHAT_FIXTURE_CHANNEL"].flatMap(UUID.init(uuidString:)),
      let token = environment["CHAT_FIXTURE_TOKEN"],
      let expiredToken = environment["CHAT_FIXTURE_EXPIRED_TOKEN"],
      let revokedToken = environment["CHAT_FIXTURE_REVOKED_TOKEN"]
    else {
      return nil
    }
    return Fixture(
      chatBaseURL: url,
      channel: ChannelID(channel),
      token: token,
      expiredToken: expiredToken,
      revokedToken: revokedToken
    )
  }()

  var connector: ChatSocketConnector {
    ChatSocketConnector(chatBaseURL: chatBaseURL)
  }
}

private func fixture() throws -> Fixture {
  try #require(Fixture.current)
}

@Suite(
  "Client contre le vrai serveur de chat (scripts/chat-integration.sh)",
  .enabled(if: Fixture.current != nil, "serveur de chat de test lancé par scripts/chat-integration.sh"),
  .timeLimit(.minutes(1))
)
struct ChatIntegrationTests {
  @Test("un message envoyé dans un salon rejoint est accepté puis diffusé")
  func nominal() async throws {
    let fixture = try fixture()
    let chat = try await fixture.connector.connect(accessToken: fixture.token)
    var events = chat.events.makeAsyncIterator()

    try await chat.join(fixture.channel)
    let outcome = try await chat.send("Bonjour depuis iOS", in: fixture.channel)
    let event = try await events.next()
    await chat.close()

    #expect(outcome == .accepted)
    guard case let .message(message) = event else {
      Issue.record("message attendu, reçu \(String(describing: event))")
      return
    }
    #expect(message.body == "Bonjour depuis iOS")
    #expect(message.channelID == fixture.channel)
    #expect(message.author.displayName == "Viewer iOS")
  }

  @Test("un message hors d'un salon rejoint est refusé par l'ack")
  func notJoined() async throws {
    let fixture = try fixture()
    let chat = try await fixture.connector.connect(accessToken: fixture.token)

    let outcome = try await chat.send("Bonjour depuis iOS", in: fixture.channel)
    await chat.close()

    #expect(outcome == .rejected(.notJoined))
  }

  @Test("un token expiré est refusé au handshake par 401")
  func expired() async throws {
    let fixture = try fixture()

    await #expect(throws: ChatConnectionError.unauthorized) {
      try await fixture.connector.connect(accessToken: fixture.expiredToken)
    }
  }

  @Test("un token de session révoquée est refusé au handshake par 403")
  func revoked() async throws {
    let fixture = try fixture()

    await #expect(throws: ChatConnectionError.forbidden) {
      try await fixture.connector.connect(accessToken: fixture.revokedToken)
    }
  }

  @Test("une trame au-delà de 4 096 octets fait fermer la connexion en 1009")
  func oversized() async throws {
    let fixture = try fixture()
    let request = ChatSocketConnector.request(chatBaseURL: fixture.chatBaseURL, accessToken: fixture.token)
    let task = URLSession.shared.webSocketTask(with: request)
    task.resume()
    let socket = URLSessionWebSocket(task: task)
    _ = try await socket.receive()

    try await socket.send("42" + String(repeating: "a", count: 5000))

    await #expect(throws: ChatConnectionError.messageTooLarge) {
      try await socket.receive()
    }
  }
}
