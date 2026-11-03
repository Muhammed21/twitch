import Networking
import Testing

private func events(from lines: [String]) -> [ServerSentEvent] {
  var parser = ServerSentEventParser()
  return lines.compactMap { parser.feed($0) }
}

@Suite("Lecture d'un flux text/event-stream, ligne à ligne")
struct ServerSentEventParserTests {
  @Test("une ligne vide publie l'événement nommé et ses données")
  func namedEvent() {
    #expect(events(from: ["event: status", #"data: {"live":true}"#, ""]) == [
      ServerSentEvent(name: "status", data: #"{"live":true}"#),
    ])
  }

  @Test("sans nom, l'événement s'appelle message")
  func defaultName() {
    #expect(events(from: ["data: x", ""]) == [ServerSentEvent(name: "message", data: "x")])
  }

  @Test("plusieurs lignes data se joignent par un saut de ligne")
  func multilineData() {
    #expect(events(from: ["data: a", "data: b", ""]) == [ServerSentEvent(name: "message", data: "a\nb")])
  }

  @Test("un commentaire, comme le battement de cœur du serveur, ne publie rien")
  func heartbeat() {
    #expect(events(from: [": heartbeat", ""]).isEmpty)
  }

  @Test("un bloc sans données ne publie rien, et le nom ne fuit pas sur l'événement suivant")
  func emptyBlock() {
    #expect(events(from: ["event: status", "", "data: x", ""]) == [ServerSentEvent(name: "message", data: "x")])
  }

  @Test("lit un champ sans espace après les deux-points, et ignore id, retry et les champs inconnus")
  func fieldVariants() {
    #expect(events(from: ["id: 7", "retry: 1000", "foo: bar", "event:status", "data:x", ""]) == [
      ServerSentEvent(name: "status", data: "x"),
    ])
  }

  @Test("une ligne data sans valeur compte comme une donnée vide")
  func bareData() {
    #expect(events(from: ["data", ""]) == [ServerSentEvent(name: "message", data: "")])
  }

  @Test("deux événements successifs sont publiés chacun à son tour")
  func successiveEvents() {
    #expect(events(from: ["event: status", "data: 1", "", "event: status", "data: 2", ""]) == [
      ServerSentEvent(name: "status", data: "1"),
      ServerSentEvent(name: "status", data: "2"),
    ])
  }
}
