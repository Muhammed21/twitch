@testable import ChatTransport
import Domain
import Foundation
import Testing

private let messageFrame = #"""
42["chat:message",{"id":"1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f","channelId":"9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69",\#
"author":{"id":"4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b","displayName":"Viewer de test"},\#
"body":"Bonjour le chat","sentAt":"2026-11-03T20:15:00Z"}]
"""#

private func firstEvent(of chat: ChatSocket) async throws -> ChatEvent? {
  var iterator = chat.events.makeAsyncIterator()
  return try await iterator.next()
}

private func outcome(of chat: ChatSocket) -> Task<ChatSendOutcome, any Error> {
  Task { try await chat.send("Bonjour le chat", in: channel) }
}

private func sentFrame(_ socket: FakeWebSocket, _ text: String) async -> Bool {
  await eventually { await socket.sent.contains(text) }
}

private func closingError(of chat: ChatSocket) async -> (any Error)? {
  await closingError(of: chat.events)
}

private func closingError(of events: AsyncThrowingStream<ChatEvent, any Error>) async -> (any Error)? {
  do {
    for try await _ in events {}
    return nil
  } catch {
    return error
  }
}

@Suite("Connexion au serveur de chat (ADR 0023 §2)", .timeLimit(.minutes(1)))
struct ChatSocketOpenTests {
  @Test("l'ouverture Engine.IO est suivie de la connexion socket.io")
  func connects() async throws {
    let socket = FakeWebSocket(frames: [openFrame, #"40{"sid":"x"}"#])

    let chat = try await openSocket(socket)

    #expect(await socket.sent == ["40"])
    await chat.close()
  }

  @Test("un refus de connexion socket.io remonte son message et ferme la socket")
  func refused() async {
    let socket = FakeWebSocket(frames: [openFrame, #"44{"message":"chatter_unavailable"}"#])

    await #expect(throws: ChatConnectionError.refused("chatter_unavailable")) {
      try await openSocket(socket)
    }
    #expect(await socket.isClosed)
  }

  @Test(
    "une poignée de main hors protocole rend le chat indisponible et ferme la socket",
    arguments: [["2"], ["40"], [openFrame, "2"], [openFrame, "garbage"]]
  )
  func unexpected(frames: [String]) async {
    let socket = FakeWebSocket(frames: frames)
    await socket.fail(SocketGone())

    await #expect(throws: ChatConnectionError.unavailable) {
      try await openSocket(socket)
    }
    #expect(await socket.isClosed)
  }

  @Test(
    "une poignée de main sans réponse dans le délai rend le chat indisponible et ferme la socket",
    arguments: [[], [openFrame]]
  )
  func handshakeTimeout(frames: [String]) async {
    let socket = FakeWebSocket(frames: frames)
    let clock = ManualClock()
    let opening = Task { try await openSocket(socket, clock: clock) }

    #expect(await eventually { await clock.onlyWaits(on: handshakeDelay, afterStarting: frames.count + 1) })
    await clock.fire(handshakeDelay)

    await #expect(throws: ChatConnectionError.unavailable) {
      try await opening.value
    }
    #expect(await socket.isClosed)
  }

  @Test("une réponse dans le délai annule l'attente de la poignée de main")
  func handshakeInTime() async throws {
    let clock = ManualClock()

    let chat = try await openSocket(clock: clock)

    #expect(await eventually { await clock.pending == [watchdogDelay] })
    await chat.close()
  }

  @Test("un refus du handshake HTTP remonte tel quel")
  func handshakeRefused() async {
    let socket = FakeWebSocket()
    await socket.fail(ChatConnectionError.unauthorized)

    await #expect(throws: ChatConnectionError.unauthorized) {
      try await openSocket(socket)
    }
  }
}

@Suite("Trames échangées sur une connexion ouverte", .timeLimit(.minutes(1)))
struct ChatSocketFrameTests {
  @Test("un ping serveur reçoit son pong")
  func pong() async throws {
    let socket = FakeWebSocket(frames: [openFrame, "40", "2"])

    let chat = try await openSocket(socket)

    #expect(await sentFrame(socket, "3"))
    await chat.close()
  }

  @Test("un message du salon est publié comme événement")
  func message() async throws {
    let socket = FakeWebSocket(frames: [openFrame, "40", messageFrame])
    let chat = try await openSocket(socket)

    let event = try await firstEvent(of: chat)

    guard case let .message(message) = event else {
      Issue.record("message attendu, reçu \(String(describing: event))")
      return
    }
    #expect(message.body == "Bonjour le chat")
    #expect(message.author.displayName == "Viewer de test")
  }

  @Test("une révocation de session est publiée comme événement")
  func revoked() async throws {
    let socket = FakeWebSocket(frames: [openFrame, "40", #"42["session:revoked",{"action":"stop"}]"#])
    let chat = try await openSocket(socket)

    #expect(try await firstEvent(of: chat) == .revoked(.stop))
  }

  @Test("une trame invalide est ignorée et comptée, la suivante passe")
  func invalidFrames() async throws {
    let socket = FakeWebSocket(frames: [
      openFrame,
      "40",
      "garbage",
      #"42["chat:delete",{}]"#,
      #"42["chat:message",{"body":"incomplet"}]"#,
      "40",
      "4399[]",
      messageFrame,
    ])
    let chat = try await openSocket(socket)

    let event = try await firstEvent(of: chat)

    #expect(event.map {
      if case .message = $0 {
        true
      } else {
        false
      }
    } == true)
    #expect(await chat.invalidFrames == 5)
  }

  @Test("rejoindre puis quitter un salon envoie les deux trames dans l'ordre")
  func rooms() async throws {
    let socket = FakeWebSocket(frames: [openFrame, "40"])
    let chat = try await openSocket(socket)

    try await chat.join(channel)
    try await chat.leave(channel)

    #expect(await eventually { await socket.sent.count == 3 })
    #expect(await socket.sent == ["40", ClientFrame.join(channel).text, ClientFrame.leave(channel).text])
  }
}

@Suite("Acks de chat:send", .timeLimit(.minutes(1)))
struct ChatSocketAckTests {
  @Test("un ack vide accepte le message envoyé sous son identifiant")
  func accepted() async throws {
    let socket = FakeWebSocket(frames: [openFrame, "40"])
    let chat = try await openSocket(socket)

    let sending = outcome(of: chat)
    #expect(await sentFrame(socket, ClientFrame.send(ackID: 0, body: "Bonjour le chat", channel: channel).text))
    await socket.push("430[]")

    #expect(try await sending.value == .accepted)
  }

  @Test("chaque envoi prend l'identifiant suivant et reçoit son propre ack")
  func distinctIDs() async throws {
    let socket = FakeWebSocket(frames: [openFrame, "40"])
    let chat = try await openSocket(socket)

    let first = outcome(of: chat)
    #expect(await sentFrame(socket, ClientFrame.send(ackID: 0, body: "Bonjour le chat", channel: channel).text))
    let second = outcome(of: chat)
    #expect(await sentFrame(socket, ClientFrame.send(ackID: 1, body: "Bonjour le chat", channel: channel).text))
    await socket.push(#"431[{"reason":"rate_limited"}]"#)
    await socket.push("430[]")

    #expect(try await second.value == .rejected(.rateLimited))
    #expect(try await first.value == .accepted)
  }

  @Test("un ack qui n'arrive pas dans le délai échoue")
  func timedOut() async throws {
    let socket = FakeWebSocket(frames: [openFrame, "40"])
    let clock = ManualClock()
    let chat = try await openSocket(socket, clock: clock)

    let sending = outcome(of: chat)
    #expect(await eventually { await clock.pending.contains(ackDelay) })
    await clock.fire(ackDelay)

    await #expect(throws: ChatConnectionError.ackTimedOut) {
      try await sending.value
    }
  }

  @Test("un ack hors contrat est compté et laisse l'envoi en attente de son délai")
  func malformedAck() async throws {
    let socket = FakeWebSocket(frames: [openFrame, "40"])
    let clock = ManualClock()
    let chat = try await openSocket(socket, clock: clock)

    let sending = outcome(of: chat)
    #expect(await eventually { await clock.pending.contains(ackDelay) })
    await socket.push("430[true]")
    #expect(await eventually { await chat.invalidFrames == 1 })
    await clock.fire(ackDelay)

    await #expect(throws: ChatConnectionError.ackTimedOut) {
      try await sending.value
    }
  }
}

@Suite("Fermeture de la connexion", .timeLimit(.minutes(1)))
struct ChatSocketCloseTests {
  @Test("fermer échoue les acks en attente, termine les événements et ferme la socket")
  func close() async throws {
    let socket = FakeWebSocket(frames: [openFrame, "40"])
    let chat = try await openSocket(socket)
    let sending = outcome(of: chat)
    #expect(await eventually { await socket.sent.count == 2 })

    await chat.close()

    await #expect(throws: ChatConnectionError.closed) {
      try await sending.value
    }
    #expect(await closingError(of: chat) == nil)
    #expect(await socket.isClosed)
  }

  @Test("après la fermeture, envoyer ou rejoindre échoue")
  func afterClose() async throws {
    let chat = try await openSocket()

    await chat.close()

    await #expect(throws: ChatConnectionError.closed) {
      try await chat.send("Bonjour le chat", in: channel)
    }
    await #expect(throws: ChatConnectionError.closed) {
      try await chat.join(channel)
    }
  }

  @Test("une déconnexion du serveur termine les événements par .closed", arguments: ["41", "1"])
  func serverDisconnect(frame: String) async throws {
    let socket = FakeWebSocket(frames: [openFrame, "40"])
    let chat = try await openSocket(socket)
    let sending = outcome(of: chat)
    #expect(await eventually { await socket.sent.count == 2 })

    await socket.push(frame)

    #expect(await closingError(of: chat) as? ChatConnectionError == .closed)
    await #expect(throws: ChatConnectionError.closed) {
      try await sending.value
    }
    #expect(await socket.isClosed)
  }

  @Test("une connexion lâchée sans close() est libérée, termine ses événements et ferme sa socket")
  func released() async throws {
    let socket = FakeWebSocket(frames: [openFrame, "40"])

    let events = try await openSocket(socket).events
    await socket.push("2")

    #expect(await closingError(of: events) as? ChatConnectionError == .closed)
    #expect(await eventually { await socket.isClosed })
  }

  @Test("une erreur de lecture termine les événements par cette erreur")
  func readFailure() async throws {
    let socket = FakeWebSocket(frames: [openFrame, "40"])
    let chat = try await openSocket(socket)

    await socket.fail(ChatConnectionError.messageTooLarge)

    #expect(await closingError(of: chat) as? ChatConnectionError == .messageTooLarge)
  }
}

@Suite("Chien de garde du ping (pingInterval + pingTimeout)", .timeLimit(.minutes(1)))
struct ChatSocketWatchdogTests {
  @Test("une connexion muette au-delà du délai est fermée et rend le chat indisponible")
  func silent() async throws {
    let socket = FakeWebSocket(frames: [openFrame, "40"])
    let clock = ManualClock()
    let chat = try await openSocket(socket, clock: clock)

    #expect(await eventually { await clock.pending == [watchdogDelay] })
    await clock.fire(watchdogDelay)

    #expect(await closingError(of: chat) as? ChatConnectionError == .unavailable)
    #expect(await socket.isClosed)
  }

  @Test("un ping annule l'attente du chien de garde précédent")
  func rearmCancels() async throws {
    let socket = FakeWebSocket(frames: [openFrame, "40"])
    let clock = ManualClock()
    let chat = try await openSocket(socket, clock: clock)

    await socket.push("2")

    #expect(await eventually { await clock.onlyWaits(on: watchdogDelay, afterStarting: 2) })
    await chat.close()
  }

  @Test("un ping réarme le chien de garde : un ancien délai qui expire quand même ne ferme rien")
  func rearmed() async throws {
    let socket = FakeWebSocket(frames: [openFrame, "40"])
    let clock = ManualClock(uncancellable: watchdogDelay)
    let chat = try await openSocket(socket, clock: clock)
    #expect(await eventually { await clock.pending == [watchdogDelay] })

    await socket.push("2")
    #expect(await eventually { await clock.pending == [watchdogDelay, watchdogDelay] })
    await clock.fire(watchdogDelay)
    await socket.push("2")

    #expect(await eventually { await socket.sent.filter { $0 == "3" }.count == 2 })
    #expect(await !socket.isClosed)
    await chat.close()
  }
}
