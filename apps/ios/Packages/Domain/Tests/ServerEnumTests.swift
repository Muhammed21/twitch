import Domain
import Testing

@Suite("Enums issus du serveur (ADR 0009, garde-fou n°4)")
struct ServerEnumTests {
  @Test(
    "un motif de refus connu se lit dans son cas",
    arguments: [
      ("timed_out", ChatRejectionReason.timedOut),
      ("rate_limited", ChatRejectionReason.rateLimited),
    ]
  )
  func knownReason(rawValue: String, expected: ChatRejectionReason) {
    #expect(ChatRejectionReason(rawValue: rawValue) == expected)
    #expect(expected.rawValue == rawValue)
  }

  @Test(
    "un motif de refus inconnu devient .unknown et garde sa valeur",
    arguments: ["banned", "", "Rate_Limited", "rate_limited "]
  )
  func unknownReason(rawValue: String) {
    let reason = ChatRejectionReason(rawValue: rawValue)

    #expect(reason == .unknown(rawValue))
    #expect(reason.rawValue == rawValue)
  }
}
