@testable import ChatTransport
import Foundation
import Testing

private func json(_ text: String) -> Data {
  Data(text.utf8)
}

@Suite("Trames reçues du serveur (Engine.IO v4, socket.io v5)")
struct ServerFrameTests {
  @Test("l'ouverture donne l'intervalle et le délai du ping")
  func open() {
    let frame = ServerFrame.parse(
      #"0{"sid":"abc","upgrades":[],"pingInterval":30000,"pingTimeout":60000,"maxPayload":4096}"#
    )

    #expect(frame == .open(pingInterval: .milliseconds(30000), pingTimeout: .milliseconds(60000)))
  }

  @Test(
    "une ouverture sans délais lisibles est rejetée",
    arguments: [
      "0",
      "0{}",
      #"0{"pingInterval":30000}"#,
      #"0{"pingTimeout":60000}"#,
      #"0{"pingInterval":"30000","pingTimeout":60000}"#,
      "0[30000,60000]",
    ]
  )
  func malformedOpen(text: String) {
    #expect(ServerFrame.parse(text) == nil)
  }

  @Test(
    "les trames de contrôle se lisent dans leur cas",
    arguments: [
      ("1", ServerFrame.close),
      ("2", ServerFrame.ping),
      ("40", ServerFrame.connected),
      (#"40{"sid":"xyz"}"#, ServerFrame.connected),
      ("41", ServerFrame.disconnected),
    ]
  )
  func control(text: String, expected: ServerFrame) {
    #expect(ServerFrame.parse(text) == expected)
  }

  @Test("un refus de connexion donne son message")
  func connectError() {
    #expect(ServerFrame.parse(#"44{"message":"chatter_unavailable"}"#) == .connectError("chatter_unavailable"))
  }

  @Test(
    "un refus de connexion sans message est rejeté",
    arguments: ["44", "44{}", #"44{"message":3}"#, #"44"chatter_unavailable""#]
  )
  func malformedConnectError(text: String) {
    #expect(ServerFrame.parse(text) == nil)
  }

  @Test("un événement donne son nom et son premier argument")
  func event() {
    let frame = ServerFrame.parse(#"42["chat:message",{"body":"salut"}]"#)

    #expect(frame == .event(name: "chat:message", payload: json(#"{"body":"salut"}"#)))
  }

  @Test("un argument qui n'est pas un objet reste la charge de l'événement")
  func eventWithScalarArgument() {
    #expect(ServerFrame.parse(#"42["chat:message","texte"]"#) == .event(name: "chat:message", payload: json(#""texte""#)))
  }

  @Test("un événement sans argument n'a pas de charge")
  func eventWithoutArgument() {
    #expect(ServerFrame.parse(#"42["chat:message"]"#) == .event(name: "chat:message", payload: nil))
  }

  @Test(
    "un événement sans nom lisible est rejeté",
    arguments: ["42", "42[]", "42[3]", #"42{"event":"chat:message"}"#, #"42["chat:message""#]
  )
  func malformedEvent(text: String) {
    #expect(ServerFrame.parse(text) == nil)
  }

  @Test("un ack donne son identifiant et son premier argument")
  func ack() {
    #expect(ServerFrame.parse(#"437[{"reason":"banned"}]"#) == .ack(id: 7, payload: json(#"{"reason":"banned"}"#)))
  }

  @Test("un ack sans argument n'a pas de charge")
  func ackWithoutArgument() {
    #expect(ServerFrame.parse("4312[]") == .ack(id: 12, payload: nil))
  }

  @Test(
    "un ack sans identifiant ou sans liste est rejeté",
    arguments: ["43[]", "43", "43x[]", "4312", #"4312{"reason":"banned"}"#, "43-1[]"]
  )
  func malformedAck(text: String) {
    #expect(ServerFrame.parse(text) == nil)
  }

  @Test(
    "une trame inconnue ou d'un autre espace de noms est rejetée",
    arguments: ["", "1x", "2probe", "3", "40x", "41x", "5", "6", "9", "4", "45", "46", "47", "4x", "40/admin,", #"42/admin,["chat:message"]"#, "x"]
  )
  func unknown(text: String) {
    #expect(ServerFrame.parse(text) == nil)
  }
}
