import Foundation
import Paywall
import Testing

private func french(_ resource: LocalizedStringResource) -> String {
  var french = resource
  french.locale = Locale(identifier: "fr_FR")
  return String(localized: french)
}

private final class CloseRecorder {
  private(set) var count = 0
  func close() {
    count += 1
  }
}

@Suite("Présentation du paywall : fin du parcours, ou page Turbo ouverte depuis le profil")
struct PaywallPresentationTests {
  @Test("à la fin du parcours, l'en-tête garde la barre de progression et « Plus tard », sans titre")
  func journey() {
    let presentation = PaywallPresentation.journey(onClose: {})
    #expect(presentation.showsJourneyHeader)
    #expect(presentation.title == nil)
    #expect(presentation.showsPlanPicker)
  }

  @Test("« Plus tard » appelle la fermeture portée par le parcours")
  func journeyCloses() throws {
    let recorder = CloseRecorder()
    let close = try #require(PaywallPresentation.journey(onClose: recorder.close).onClose)
    close()
    #expect(recorder.count == 1)
  }

  @Test("depuis le profil, une page « Turbo » poussée, avec retour et sans progression (abonnement/turbo--defaut)")
  func pushed() throws {
    #expect(!PaywallPresentation.pushed.showsJourneyHeader)
    #expect(try french(#require(PaywallPresentation.pushed.title)) == "Turbo")
    #expect(PaywallPresentation.pushed.onClose == nil)
  }

  @Test("la page Turbo n'a pas de choix de formule : un seul bouton sous l'accroche (abonnement/turbo--defaut)")
  func pushedWithoutPlanPicker() {
    #expect(!PaywallPresentation.pushed.showsPlanPicker)
  }
}
