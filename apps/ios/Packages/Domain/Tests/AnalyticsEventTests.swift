import Domain
import Testing

@Suite("Événements analytics générés depuis packages/contracts (ADR 0012)")
struct AnalyticsEventTests {
  @Test("un événement sans propriété porte le nom objet:action_au_passé de la taxonomie")
  func nameOnly() {
    #expect(AnalyticsEvent.accountSignedUp.name.rawValue == "account:signed_up")
    #expect(AnalyticsEvent.accountSignedUp.properties.isEmpty)
  }

  @Test("un payload typé devient des propriétés snake_case")
  func typedPayload() {
    let event = AnalyticsEvent.onboardingStepCompleted(step: "categories", durationMs: 1200)

    #expect(event.name == .onboardingStepCompleted)
    #expect(event.properties == ["step": .string("categories"), "duration_ms": .int(1200)])
  }

  @Test("une énumération est envoyée par sa valeur brute")
  func enumeratedPayload() {
    let event = AnalyticsEvent.categoryFollowed(categoryID: "c-1", source: .onboarding)

    #expect(event.properties == ["category_id": .string("c-1"), "source": .string("onboarding")])
  }

  @Test("les clés PII interdites sont celles de l'ADR 0012")
  func forbiddenKeys() {
    #expect(AnalyticsEvent.forbiddenPropertyKeys == ["email", "phone", "name", "address", "ip", "token", "password"])
  }
}
