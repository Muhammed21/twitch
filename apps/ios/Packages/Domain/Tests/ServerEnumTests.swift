import Domain
import Testing

@Suite("Enums issus du serveur (ADR 0009, garde-fou n°4)")
struct ServerEnumTests {
  @Test(
    "un motif de refus connu se lit dans son cas",
    arguments: [
      ("timed_out", ChatRejectionReason.timedOut),
      ("banned", ChatRejectionReason.banned),
      ("rate_limited", ChatRejectionReason.rateLimited),
      ("not_joined", ChatRejectionReason.notJoined),
    ]
  )
  func knownReason(rawValue: String, expected: ChatRejectionReason) {
    #expect(ChatRejectionReason(rawValue: rawValue) == expected)
    #expect(expected.rawValue == rawValue)
  }

  @Test(
    "un motif de refus inconnu devient .unknown et garde sa valeur",
    arguments: ["slow_mode", "", "Rate_Limited", "rate_limited "]
  )
  func unknownReason(rawValue: String) {
    let reason = ChatRejectionReason(rawValue: rawValue)

    #expect(reason == .unknown(rawValue))
    #expect(reason.rawValue == rawValue)
  }

  @Test(
    "une action de révocation connue se lit dans son cas",
    arguments: [
      ("refresh_and_reconnect", SessionRevocation.refreshAndReconnect),
      ("stop", SessionRevocation.stop),
    ]
  )
  func knownRevocation(rawValue: String, expected: SessionRevocation) {
    #expect(SessionRevocation(rawValue: rawValue) == expected)
    #expect(expected.rawValue == rawValue)
  }

  @Test(
    "une action de révocation inconnue devient .unknown et garde sa valeur",
    arguments: ["logout", "", "Stop"]
  )
  func unknownRevocation(rawValue: String) {
    let action = SessionRevocation(rawValue: rawValue)

    #expect(action == .unknown(rawValue))
    #expect(action.rawValue == rawValue)
  }
}
