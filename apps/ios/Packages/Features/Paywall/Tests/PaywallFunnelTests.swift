import AnalyticsTesting
import Domain
import Paywall
import PurchasesTesting
import Testing

private let monthly = SubscriptionPackage(id: "$rc_monthly", offeringID: "turbo", period: .month, localizedPrice: "4,99 €", price: 4.99)
private let turboOffering = SubscriptionOffering(id: "turbo", packages: [monthly])

@MainActor
private func makeStore(
  _ purchases: FakePurchases,
  analytics: RecordingAnalytics,
  variant: String? = "variant_b",
  placement: AnalyticsPlacement = .onboarding
) -> PaywallStore {
  PaywallStore(purchases: purchases, offeringID: nil, variant: { variant }, placement: placement, analytics: analytics)
}

@MainActor
@Suite("Paywall Turbo : exposition, fermeture et issues d'achat dans PostHog (ADR 0051, §7)")
struct PaywallFunnelTests {
  @Test("l'offre affichée émet paywall:viewed une fois, avec la variante, l'offering et l'emplacement", arguments: [
    AnalyticsPlacement.onboarding, .profile,
  ])
  func viewed(placement: AnalyticsPlacement) async {
    let analytics = RecordingAnalytics()
    let store = makeStore(FakePurchases(offering: turboOffering), analytics: analytics, placement: placement)

    await store.load()
    await store.load()

    #expect(analytics.captured == [.paywallViewed(variant: "variant_b", offeringID: "turbo", placement: placement)])
  }

  @Test("sans variante, l'offre affichée n'émet aucune exposition (ADR 0016)")
  func viewedWithoutVariant() async {
    let analytics = RecordingAnalytics()
    let store = makeStore(FakePurchases(offering: turboOffering), analytics: analytics, variant: nil)

    await store.load()
    store.dismiss()

    #expect(analytics.captured.isEmpty)
  }

  @Test("un paywall indisponible ou déjà abonné n'est pas une exposition")
  func notViewed() async {
    let analytics = RecordingAnalytics()
    let unavailable = makeStore(FakePurchases(offering: turboOffering, isAvailable: false), analytics: analytics)
    let subscriber = FakePurchases(offering: turboOffering)
    subscriber.turboActive = .success(true)
    let subscribed = makeStore(subscriber, analytics: analytics)

    await unavailable.load()
    await subscribed.load()
    unavailable.dismiss()
    subscribed.dismiss()

    #expect(analytics.captured.isEmpty)
  }

  @Test("fermer l'offre sans acheter émet paywall:dismissed une fois, avec la variante et l'emplacement")
  func dismissed() async {
    let analytics = RecordingAnalytics()
    let store = makeStore(FakePurchases(offering: turboOffering), analytics: analytics, placement: .profile)
    await store.load()

    store.dismiss()
    store.dismiss()

    #expect(analytics.captured.last == .paywallDismissed(variant: "variant_b", placement: .profile))
    #expect(analytics.captured.count(where: { $0.name == .paywallDismissed }) == 1)
  }

  @Test("fermer après un achat réussi n'est pas une fermeture sans achat")
  func dismissedAfterPurchase() async {
    let analytics = RecordingAnalytics()
    let store = makeStore(FakePurchases(offering: turboOffering), analytics: analytics)
    await store.load()
    await store.subscribe(monthly)

    store.dismiss()

    #expect(!analytics.captured.map(\.name).contains(.paywallDismissed))
  }

  @Test("le tap sur l'achat émet purchase:started avant l'issue")
  func started() async {
    let analytics = RecordingAnalytics()
    let store = makeStore(FakePurchases(offering: turboOffering), analytics: analytics)
    await store.load()

    await store.subscribe(monthly)

    #expect(Array(analytics.captured.dropFirst()) == [
      .purchaseStarted(productID: "$rc_monthly", variant: "variant_b"),
      .purchaseCompleted(productID: "$rc_monthly", variant: "variant_b"),
    ])
  }

  @Test("l'annulation dans la feuille StoreKit émet purchase:cancelled")
  func cancelled() async {
    let purchases = FakePurchases(offering: turboOffering)
    purchases.purchaseReply = .success(.cancelled)
    let analytics = RecordingAnalytics()
    let store = makeStore(purchases, analytics: analytics)
    await store.load()

    await store.subscribe(monthly)

    #expect(analytics.captured.last == .purchaseCancelled(productID: "$rc_monthly", variant: "variant_b"))
  }

  @Test("l'échec de l'achat émet purchase:failed avec le code d'erreur RevenueCat", arguments: [
    (PurchasesFailure.failed(code: "networkError"), "networkError"),
    (.failed(code: ""), "unknown"),
    (.unavailable, "unavailable"),
    (.noOffering, "no_offering"),
  ])
  func failed(failure: PurchasesFailure, code: String) async {
    let purchases = FakePurchases(offering: turboOffering)
    purchases.purchaseReply = .failure(failure)
    let analytics = RecordingAnalytics()
    let store = makeStore(purchases, analytics: analytics)
    await store.load()

    await store.subscribe(monthly)

    #expect(analytics.captured.last == .purchaseFailed(productID: "$rc_monthly", variant: "variant_b", errorCode: code))
  }

  @Test("sans variante, le tap et ses issues n'émettent rien")
  func purchaseWithoutVariant() async {
    let purchases = FakePurchases(offering: turboOffering)
    purchases.purchaseReply = .success(.cancelled)
    let analytics = RecordingAnalytics()
    let store = makeStore(purchases, analytics: analytics, variant: nil)
    await store.load()

    await store.subscribe(monthly)

    #expect(analytics.captured.isEmpty)
  }

  @Test("la fin d'une restauration émet purchase:restored avec l'état du droit, même sans variante", arguments: [true, false])
  func restored(isActive: Bool) async {
    let purchases = FakePurchases(offering: turboOffering)
    let analytics = RecordingAnalytics()
    let store = makeStore(purchases, analytics: analytics, variant: nil)
    await store.load()
    purchases.turboActive = .success(isActive)

    await store.restore()

    #expect(analytics.captured == [.purchaseRestored(hasActiveEntitlement: isActive)])
  }

  @Test("une restauration en échec n'a pas de fin à mesurer")
  func restoreFailed() async {
    let purchases = FakePurchases(offering: turboOffering)
    let analytics = RecordingAnalytics()
    let store = makeStore(purchases, analytics: analytics, variant: nil)
    await store.load()
    purchases.turboActive = .failure(.failed(code: "networkError"))

    await store.restore()

    #expect(analytics.captured.isEmpty)
  }

  @Test("fermer après une restauration qui retrouve Turbo n'est pas une fermeture sans achat")
  func dismissedAfterRestore() async {
    let purchases = FakePurchases(offering: turboOffering)
    let analytics = RecordingAnalytics()
    let store = makeStore(purchases, analytics: analytics)
    await store.load()
    purchases.turboActive = .success(true)
    await store.restore()

    store.dismiss()

    #expect(!analytics.captured.map(\.name).contains(.paywallDismissed))
  }
}
