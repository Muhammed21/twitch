import Domain
import Testing

@Suite("Événements analytics générés depuis packages/contracts (ADR 0012, ADR 0051 §7)")
struct AnalyticsEventTests {
  @Test("un événement sans propriété porte le nom objet:action_au_passé de la taxonomie")
  func nameOnly() {
    #expect(AnalyticsEvent.accountSignedUp.name.rawValue == "account:signed_up")
    #expect(AnalyticsEvent.accountSignedUp.properties.isEmpty)
  }

  @Test("un payload typé devient des propriétés snake_case, l'étape par sa valeur brute")
  func typedPayload() {
    let event = AnalyticsEvent.onboardingStepCompleted(step: .contentPreferences, stepIndex: 3, durationMs: 1200, selectionCount: 2)

    #expect(event.name == .onboardingStepCompleted)
    #expect(event.properties == [
      "step": .string("content_preferences"),
      "step_index": .int(3),
      "duration_ms": .int(1200),
      "selection_count": .int(2),
    ])
  }

  @Test("un booléen garde son préfixe is_")
  func booleanPayload() {
    #expect(AnalyticsEvent.notificationPermissionAnswered(isGranted: true).properties == ["is_granted": .bool(true)])
  }

  @Test("le parcours compte dix pages, du intro au récap")
  func steps() {
    #expect(AnalyticsStep.allCases.count == 10)
  }

  @Test("les clés PII interdites sont celles de l'ADR 0012")
  func forbiddenKeys() {
    #expect(AnalyticsEvent.forbiddenPropertyKeys == ["email", "phone", "name", "address", "ip", "token", "password"])
  }
}
