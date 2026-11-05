import Domain
import Foundation
import Paywall
import Testing

private func package(_ period: SubscriptionPeriod, _ price: Decimal) -> SubscriptionPackage {
  SubscriptionPackage(id: "\(period)", offeringID: "default", period: period, localizedPrice: "\(price)", price: price)
}

private func offering(_ packages: SubscriptionPackage...) -> SubscriptionOffering {
  SubscriptionOffering(id: "default", packages: packages)
}

@Suite("Économie de l'abonnement annuel sur douze mois au prix mensuel")
struct PaywallOfferTests {
  @Test("l'économie est arrondie à l'entier inférieur", arguments: [
    (Decimal(string: "9.99"), Decimal(string: "79.99"), 33),
    (Decimal(10), Decimal(60), 50),
    (Decimal(string: "4.99"), Decimal(string: "49.99"), 16),
  ])
  func savings(monthly: Decimal?, annual: Decimal?, percent: Int) throws {
    let offer = try offering(package(.month, #require(monthly)), package(.year, #require(annual)))

    #expect(PaywallOffer.annualSavings(in: offer) == percent)
  }

  @Test("sans mensuel ou sans annuel, aucune économie annoncée")
  func incomplete() {
    #expect(PaywallOffer.annualSavings(in: offering(package(.year, 60))) == nil)
    #expect(PaywallOffer.annualSavings(in: offering(package(.month, 10))) == nil)
  }

  @Test("un annuel qui n'économise rien n'annonce rien", arguments: [Decimal(120), Decimal(130), Decimal(string: "119.99")])
  func noSaving(annual: Decimal?) throws {
    let offer = try offering(package(.month, 10), package(.year, #require(annual)))

    #expect(PaywallOffer.annualSavings(in: offer) == nil)
  }

  @Test("un mensuel gratuit n'annonce rien")
  func freeMonthly() {
    #expect(PaywallOffer.annualSavings(in: offering(package(.month, 0), package(.year, 0))) == nil)
  }
}
