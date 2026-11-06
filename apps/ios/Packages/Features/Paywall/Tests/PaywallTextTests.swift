import Domain
import Foundation
import Paywall
import Testing

private let terms = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")
private let privacy = URL(string: "https://example.org/privacy")

private let englishLocale = Locale(identifier: "en_US")

private func english(_ resource: LocalizedStringResource) -> String {
  var english = resource
  english.locale = englishLocale
  return String(localized: english)
}

private func links(in text: AttributedString) -> [String: URL] {
  Dictionary(
    text.runs.compactMap { run in run.link.map { (String(text[run.range].characters), $0) } },
    uniquingKeysWith: { first, _ in first }
  )
}

@Suite("Textes du paywall Turbo, d'après abonnement/turbo--defaut et les décisions de l'ADR 0051")
struct PaywallTextTests {
  @Test("le titre, l'accroche et la carte d'avantages ne promettent que le badge et la couleur")
  func labels() {
    #expect(english(PaywallText.title) == "Turbo")
    #expect(english(PaywallText.headline) == "Stand Out in Every Chat")
    #expect(english(PaywallText.tagline) == "Support streamers and make your name shine in chat.")
    #expect(english(PaywallText.perks) == "Custom chat username colors, Battery Chat Badge")
    #expect(english(PaywallText.restore) == "Restore Purchases")
    #expect(english(PaywallText.close) == "Close")
  }

  @Test(
    "le bouton reprend le prix et la période de l'offre",
    arguments: [
      (SubscriptionPeriod.month, "4,99 €", "Subscribe for 4,99 €/month"),
      (.year, "SGD 194.99", "Subscribe for SGD 194.99/year"),
    ]
  )
  func subscribe(period: SubscriptionPeriod, price: String, expected: String) {
    let package = SubscriptionPackage(id: "p", offeringID: "default", period: period, localizedPrice: price, price: 1)

    #expect(english(PaywallText.subscribe(package)) == expected)
  }

  @Test("la ligne de facturation suit la période", arguments: [
    (SubscriptionPeriod.month, "Billed monthly • Cancel anytime"),
    (.year, "Billed yearly • Cancel anytime"),
  ])
  func billing(period: SubscriptionPeriod, expected: String) {
    #expect(english(PaywallText.billing(period)) == expected)
  }

  @Test("les mentions légales lient les conditions et la confidentialité quand leurs adresses existent")
  func legalWithLinks() throws {
    let legal = PaywallText.legal(terms: terms, privacy: privacy, locale: englishLocale)

    #expect(String(legal.characters) == "By subscribing, you agree to the Terms of Use (EULA) and acknowledge our Privacy Notice")
    #expect(try links(in: legal) == ["Terms of Use (EULA)": #require(terms), "Privacy Notice": #require(privacy)])
  }

  @Test("sans adresse de confidentialité, la phrase reste entière et seul le lien des conditions existe")
  func legalWithoutPrivacy() throws {
    let legal = PaywallText.legal(terms: terms, privacy: nil, locale: englishLocale)

    #expect(String(legal.characters) == "By subscribing, you agree to the Terms of Use (EULA) and acknowledge our Privacy Notice")
    #expect(try links(in: legal) == ["Terms of Use (EULA)": #require(terms)])
  }

  @Test(
    "chaque message dit ce qui s'est passé",
    arguments: [
      (PaywallStore.Notice.purchaseFailed, "Couldn't complete your purchase. Try again."),
      (.nothingToRestore, "No Turbo subscription found to restore."),
      (.restoreFailed, "Couldn't restore your purchases. Try again."),
    ]
  )
  func notices(notice: PaywallStore.Notice, expected: String) {
    #expect(english(PaywallText.notice(notice)) == expected)
  }

  @Test(
    "le message de restauration s'affiche près du bouton Restaurer, celui d'achat près du bouton S'abonner",
    arguments: [
      (PaywallStore.Notice.purchaseFailed, false),
      (.nothingToRestore, true),
      (.restoreFailed, true),
    ]
  )
  func noticePlacement(notice: PaywallStore.Notice, aboutRestore: Bool) {
    #expect(notice.isAboutRestore == aboutRestore)
  }

  @Test("l'état abonné et l'état indisponible")
  func states() {
    #expect(english(PaywallText.subscribedTitle) == "You're a Turbo subscriber")
    #expect(english(PaywallText.subscribedMessage) == "Your Battery Chat Badge and username colors are ready.")
    #expect(english(PaywallText.unavailable) == "Turbo isn't available right now. Try again later.")
  }

  @Test("l'étape Turbo du parcours : plus tard, avantages et formules")
  func journeyStep() {
    #expect(english(PaywallText.later) == "Maybe Later")
    #expect(english(PaywallText.badgePerk) == "Battery Chat Badge")
    #expect(english(PaywallText.badgePerkDetail) == "Shown next to your name in every chat.")
    #expect(english(PaywallText.colorPerk) == "Custom Username Color")
    #expect(english(PaywallText.colorPerkDetail) == "Pick the color of your name in chat.")
    #expect(english(PaywallText.choosePlan) == "Choose your plan")
  }

  @Test("chaque formule porte son nom", arguments: [(SubscriptionPeriod.month, "Monthly"), (.year, "Yearly")])
  func plan(period: SubscriptionPeriod, expected: String) {
    #expect(english(PaywallText.plan(period)) == expected)
  }

  @Test("l'économie annuelle se lit en pourcentage")
  func savings() {
    #expect(english(PaywallText.savings(33)) == "Save 33%")
  }

  @Test("en français, les libellés de l'étape Turbo", arguments: [
    (PaywallText.later, "Plus tard"),
    (PaywallText.restore, "Restaurer les achats"),
    (PaywallText.plan(.year), "Annuel"),
    (PaywallText.savings(33), "Économisez 33\u{00A0}%"),
    (PaywallText.subscribe(SubscriptionPackage(id: "p", offeringID: "default", period: .year, localizedPrice: "79,99 €", price: 1)), "S'abonner pour 79,99 €/an"),
    (PaywallText.billing(.month), "Facturé chaque mois • Résiliable à tout moment"),
  ])
  func french(resource: LocalizedStringResource, expected: String) {
    var french = resource
    french.locale = Locale(identifier: "fr_FR")

    #expect(String(localized: french) == expected)
  }

  @Test("en français, les mentions légales reprennent les termes d'Apple")
  func frenchLegal() throws {
    let legal = PaywallText.legal(terms: terms, privacy: privacy, locale: Locale(identifier: "fr_FR"))

    #expect(String(legal.characters) == "En vous abonnant, vous acceptez les Conditions d'utilisation (CLUF) "
      + "et reconnaissez avoir pris connaissance de notre Politique de confidentialité")
    #expect(try links(in: legal) == [
      "Conditions d'utilisation (CLUF)": #require(terms),
      "Politique de confidentialité": #require(privacy),
    ])
  }
}
