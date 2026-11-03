@testable import ChatTransport
import Domain
import Foundation
import Testing

private let channel = ChannelID(UUID(uuidString: "9B8A7F6E-5D4C-4B3A-8F10-1E2D3C4B5A69") ?? UUID())

@Suite("Trames envoyées au serveur")
struct ClientFrameTests {
  @Test("le pong et la connexion à l'espace de noms par défaut")
  func control() {
    #expect(ClientFrame.pong.text == "3")
    #expect(ClientFrame.connect.text == "40")
  }

  @Test("rejoindre et quitter un salon portent l'identifiant de chaîne en minuscules")
  func rooms() {
    #expect(ClientFrame.join(channel).text == #"42["room:join",{"channelId":"9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69"}]"#)
    #expect(ClientFrame.leave(channel).text == #"42["room:leave",{"channelId":"9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69"}]"#)
  }

  @Test("l'envoi d'un message demande un ack sous son identifiant")
  func send() {
    let frame = ClientFrame.send(ackID: 7, body: "Bonjour le chat", channel: channel)

    #expect(frame.text == #"427["chat:send",{"body":"Bonjour le chat","channelId":"9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69"}]"#)
  }

  @Test("le corps d'un message est échappé en JSON")
  func escapedBody() {
    let frame = ClientFrame.send(ackID: 0, body: "dit \"salut\"\n]/", channel: channel)

    #expect(frame.text == #"420["chat:send",{"body":"dit \"salut\"\n]/","channelId":"9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69"}]"#)
  }
}
