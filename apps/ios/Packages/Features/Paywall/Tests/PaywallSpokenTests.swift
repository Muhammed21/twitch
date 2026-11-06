import Foundation
import Paywall
import Testing

private func spoken(_ resource: LocalizedStringResource?, in language: String) -> String? {
  resource.map {
    var localized = $0
    localized.locale = Locale(identifier: language)
    return String(localized: localized)
  }
}

@Suite("Paywall lu par VoiceOver")
struct PaywallSpokenTests {
  @Test("un achat ou une restauration qui échoue est annoncé ; sans avis, rien")
  func announcement() {
    #expect(spoken(PaywallText.announcement(for: .purchaseFailed), in: "en") == "Couldn't complete your purchase. Try again.")
    #expect(spoken(PaywallText.announcement(for: .purchaseFailed), in: "fr") == "L'achat n'a pas pu aboutir. Réessayez.")
    #expect(PaywallText.announcement(for: nil) == nil)
  }

  @Test("pendant l'achat, le bouton garde son libellé et dit que l'achat est en cours")
  func purchasing() {
    #expect(spoken(PaywallText.purchasing(true), in: "en") == "Purchase in progress")
    #expect(spoken(PaywallText.purchasing(true), in: "fr") == "Achat en cours")
    #expect(PaywallText.purchasing(false) == nil)
  }
}
