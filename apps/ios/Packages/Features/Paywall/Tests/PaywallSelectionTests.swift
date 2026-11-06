import AnalyticsTesting
import Domain
import Paywall
import PurchasesTesting
import Testing

private let monthly = SubscriptionPackage(id: "$rc_monthly", offeringID: "default", period: .month, localizedPrice: "4,99 €", price: 4.99)
private let annual = SubscriptionPackage(id: "$rc_annual", offeringID: "default", period: .year, localizedPrice: "49,99 €", price: 49.99)
private let defaultOffering = SubscriptionOffering(id: "default", packages: [monthly, annual])

@MainActor
private func makeStore(_ purchases: FakePurchases) -> PaywallStore {
  PaywallStore(purchases: purchases, offeringID: nil, analytics: RecordingAnalytics())
}

@MainActor
@Suite("Paywall Turbo : choix de la formule, annuel d'office")
struct PaywallSelectionTests {
  @Test("l'annuel est choisi d'office, même rendu après le mensuel")
  func annualPreselected() async {
    let store = makeStore(FakePurchases(offering: defaultOffering))

    await store.load()

    #expect(store.selected == annual)
  }

  @Test("sans annuel, la première formule est choisie")
  func firstWithoutAnnual() async {
    let store = makeStore(FakePurchases(offering: SubscriptionOffering(id: "default", packages: [monthly])))

    await store.load()

    #expect(store.selected == monthly)
  }

  @Test("choisir une formule la sélectionne")
  func selects() async {
    let store = makeStore(FakePurchases(offering: defaultOffering))
    await store.load()

    store.select(monthly)

    #expect(store.selected == monthly)
  }

  @Test("pendant un achat, la formule choisie ne change pas")
  func noSelectionWhilePurchasing() async {
    let purchases = FakePurchases(offering: defaultOffering)
    purchases.holdsPurchases = true
    let store = makeStore(purchases)
    await store.load()

    let purchase = Task { await store.subscribe(annual) }
    await purchases.waitForHeldPurchase()
    store.select(monthly)

    #expect(store.selected == annual)
    purchases.releasePurchase()
    await purchase.value
  }

  @Test("pendant une restauration, la formule choisie ne change pas")
  func noSelectionWhileRestoring() async {
    let purchases = FakePurchases(offering: defaultOffering)
    purchases.holdsRestores = true
    let store = makeStore(purchases)
    await store.load()

    let restore = Task { await store.restore() }
    await purchases.waitForHeldRestore()
    store.select(monthly)

    #expect(store.selected == annual)
    purchases.releaseRestore()
    await restore.value
  }
}
