import AnalyticsTesting
import Domain
import Paywall
import PurchasesTesting
import Testing

private let monthly = SubscriptionPackage(id: "$rc_monthly", offeringID: "default", period: .month, localizedPrice: "4,99 €", price: 4.99)
private let annual = SubscriptionPackage(id: "$rc_annual", offeringID: "default", period: .year, localizedPrice: "49,99 €", price: 49.99)
private let defaultOffering = SubscriptionOffering(id: "default", packages: [monthly, annual])

@MainActor
private func makeStore(_ purchases: FakePurchases, analytics: RecordingAnalytics, variant: String? = "variant_b") -> PaywallStore {
  PaywallStore(purchases: purchases, offeringID: nil, variant: { variant }, analytics: analytics)
}

@MainActor
@Suite("Paywall Turbo : événement d'achat réussi (ADR 0051, §7)")
struct PaywallAnalyticsTests {
  @Test("un achat RevenueCat réussi émet purchase:completed avec la formule et la variante")
  func completed() async {
    let purchases = FakePurchases(offering: defaultOffering)
    let analytics = RecordingAnalytics()
    let store = makeStore(purchases, analytics: analytics)
    await store.load()

    await store.subscribe(annual)

    #expect(analytics.captured.last == .purchaseCompleted(productID: "$rc_annual", variant: "variant_b"))
  }

  @Test("un achat annulé ou en échec n'émet pas purchase:completed", arguments: [
    Result<PurchaseOutcome, PurchasesFailure>.success(.cancelled),
    .failure(.failed(code: "network")),
  ])
  func notCompleted(reply: Result<PurchaseOutcome, PurchasesFailure>) async {
    let purchases = FakePurchases(offering: defaultOffering)
    purchases.purchaseReply = reply
    let analytics = RecordingAnalytics()
    let store = makeStore(purchases, analytics: analytics)
    await store.load()

    await store.subscribe(monthly)

    #expect(analytics.captured.map(\.name).contains(.purchaseCompleted) == false)
  }

  @Test("sans variante, l'achat réussi n'émet rien, comme l'exposition au paywall (ADR 0016)")
  func noVariant() async {
    let purchases = FakePurchases(offering: defaultOffering)
    let analytics = RecordingAnalytics()
    let store = makeStore(purchases, analytics: analytics, variant: nil)
    await store.load()

    await store.subscribe(monthly)

    #expect(store.phase == .subscribed)
    #expect(analytics.captured.isEmpty)
  }

  @Test("une restauration qui retrouve Turbo n'est pas un achat réussi")
  func restoreIsNotCompleted() async {
    let purchases = FakePurchases(offering: defaultOffering)
    let analytics = RecordingAnalytics()
    let store = makeStore(purchases, analytics: analytics)
    await store.load()
    purchases.turboActive = .success(true)

    await store.restore()

    #expect(analytics.captured.map(\.name).contains(.purchaseCompleted) == false)
  }
}
