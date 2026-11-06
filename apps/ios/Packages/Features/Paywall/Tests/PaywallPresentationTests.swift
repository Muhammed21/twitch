import Foundation
import Paywall
import Testing

private func french(_ resource: LocalizedStringResource) -> String {
  var french = resource
  french.locale = Locale(identifier: "fr_FR")
  return String(localized: french)
}

@Suite("Présentation du paywall : fin du parcours, ou page Turbo ouverte depuis le profil")
struct PaywallPresentationTests {
  @Test("à la fin du parcours, l'en-tête garde la barre de progression et « Plus tard », sans titre")
  func journey() {
    #expect(PaywallPresentation.journey.showsJourneyHeader)
    #expect(PaywallPresentation.journey.title == nil)
  }

  @Test("depuis le profil, une page « Turbo » poussée, avec retour et sans progression (abonnement/turbo--defaut)")
  func pushed() throws {
    #expect(!PaywallPresentation.pushed.showsJourneyHeader)
    #expect(try french(#require(PaywallPresentation.pushed.title)) == "Turbo")
  }
}
