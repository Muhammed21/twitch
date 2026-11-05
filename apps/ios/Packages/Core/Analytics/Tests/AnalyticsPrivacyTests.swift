import Analytics
import Domain
import Testing

@Suite("Filtre before_send : aucune PII ne sort de l'app (ADR 0012, §1)")
struct AnalyticsPrivacyTests {
  @Test("retire une clé PII, seule ou comme mot d'une clé", arguments: Array(AnalyticsEvent.forbiddenPropertyKeys))
  func forbiddenKey(key: String) {
    let redacted = AnalyticsPrivacy.redacted([key: "x", "user_\(key)": "x", "step": "categories"])

    #expect(redacted.keys.sorted() == ["step"])
  }

  @Test("garde une clé qui contient une clé PII sans en être un mot")
  func lookalike() {
    let redacted = AnalyticsPrivacy.redacted(["recipient_id": "r-1", "tokens_count": 3])

    #expect(redacted.keys.sorted() == ["recipient_id", "tokens_count"])
  }

  @Test("garde les propriétés du SDK, sauf celles qui portent une PII")
  func sdkProperties() {
    let redacted = AnalyticsPrivacy.redacted([
      "$os_name": "iOS",
      "$app_name": "Twitch",
      "$device_name": "iPhone",
      "$email": "viewer@twitch.local",
      "$ip": "10.0.0.1",
    ])

    #expect(redacted.keys.sorted() == ["$app_name", "$device_name", "$os_name"])
  }

  @Test("descend dans les propriétés de personne posées par le SDK")
  func nested() {
    let redacted = AnalyticsPrivacy.redacted(["$set": ["email": "viewer@twitch.local", "plan": "free"]])

    #expect((redacted["$set"] as? [String: Any])?.keys.sorted() == ["plan"])
  }
}
