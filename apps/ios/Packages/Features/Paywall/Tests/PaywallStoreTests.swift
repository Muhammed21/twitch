import Domain
import Paywall
import PurchasesTesting
import Testing

private let monthly = SubscriptionPackage(id: "$rc_monthly", offeringID: "default", period: .month, localizedPrice: "4,99 €")
private let annual = SubscriptionPackage(id: "$rc_annual", offeringID: "default", period: .year, localizedPrice: "49,99 €")
private let defaultOffering = SubscriptionOffering(id: "default", packages: [monthly, annual])

@MainActor
private func makeStore(_ purchases: FakePurchases, offeringID: String? = nil) -> PaywallStore {
  PaywallStore(purchases: purchases, offeringID: offeringID)
}

@MainActor
@Suite("Paywall Turbo : offre, achat et restauration (plan onboarding-paywall, PR 25)")
struct PaywallStoreTests {
  @Test("l'offre affichée est celle que rend RevenueCat, prix compris")
  func showsOffering() async {
    let purchases = FakePurchases(offering: defaultOffering)
    let store = makeStore(purchases, offeringID: "annual_first")

    await store.load()

    #expect(store.phase == .ready(defaultOffering))
    #expect(purchases.calls == [.isTurboActive, .offering("annual_first")])
  }

  @Test("un abonné voit l'état « abonné » sans offre")
  func alreadySubscribed() async {
    let purchases = FakePurchases(offering: defaultOffering)
    purchases.turboActive = .success(true)
    let store = makeStore(purchases)

    await store.load()

    #expect(store.phase == .subscribed)
    #expect(purchases.calls == [.isTurboActive])
  }

  @Test("sans clé SDK, le paywall se dit indisponible sans rien demander")
  func unavailable() async {
    let purchases = FakePurchases(offering: defaultOffering, isAvailable: false)
    let store = makeStore(purchases)

    await store.load()

    #expect(store.phase == .unavailable)
    #expect(purchases.calls.isEmpty)
  }

  @Test("une offre introuvable rend le paywall indisponible", arguments: [PurchasesFailure.noOffering, .failed(code: "network")])
  func offeringFails(failure: PurchasesFailure) async {
    let purchases = FakePurchases(offering: defaultOffering)
    purchases.offerings = .failure(failure)
    let store = makeStore(purchases)

    await store.load()

    #expect(store.phase == .unavailable)
  }

  @Test("un achat réussi passe à l'état « abonné »")
  func purchase() async {
    let purchases = FakePurchases(offering: defaultOffering)
    let store = makeStore(purchases)
    await store.load()

    await store.subscribe(annual)

    #expect(store.phase == .subscribed)
    #expect(purchases.calls.last == .purchase(annual))
  }

  @Test("une annulation StoreKit garde le paywall, sans message")
  func cancelled() async {
    let purchases = FakePurchases(offering: defaultOffering)
    purchases.purchaseReply = .success(.cancelled)
    let store = makeStore(purchases)
    await store.load()

    await store.subscribe(monthly)

    #expect(store.phase == .ready(defaultOffering))
    #expect(store.notice == nil)
  }

  @Test("un échec garde le paywall et l'annonce")
  func failed() async {
    let purchases = FakePurchases(offering: defaultOffering)
    purchases.purchaseReply = .failure(.failed(code: "payment_pending"))
    let store = makeStore(purchases)
    await store.load()

    await store.subscribe(monthly)

    #expect(store.phase == .ready(defaultOffering))
    #expect(store.notice == .purchaseFailed)
  }

  @Test("pendant un achat, le paywall le montre et refuse un second achat")
  func purchasing() async {
    let purchases = FakePurchases(offering: defaultOffering)
    purchases.holdsPurchases = true
    let store = makeStore(purchases)
    await store.load()

    let first = Task { await store.subscribe(monthly) }
    await purchases.waitForHeldPurchase()

    #expect(store.purchasing == monthly)
    await store.subscribe(annual)
    #expect(purchases.calls.contains(.purchase(annual)) == false)

    purchases.releasePurchase()
    await first.value
    #expect(store.purchasing == nil)
    #expect(store.phase == .subscribed)
  }

  @Test("une restauration qui retrouve Turbo passe à l'état « abonné »")
  func restored() async {
    let purchases = FakePurchases(offering: defaultOffering)
    let store = makeStore(purchases)
    await store.load()
    purchases.turboActive = .success(true)

    await store.restore()

    #expect(store.phase == .subscribed)
    #expect(purchases.calls.last == .restore)
  }

  @Test("une restauration sans abonnement le dit et garde l'offre")
  func nothingToRestore() async {
    let purchases = FakePurchases(offering: defaultOffering)
    let store = makeStore(purchases)
    await store.load()

    await store.restore()

    #expect(store.phase == .ready(defaultOffering))
    #expect(store.notice == .nothingToRestore)
  }

  @Test("une restauration en échec l'annonce")
  func restoreFailed() async {
    let purchases = FakePurchases(offering: defaultOffering)
    let store = makeStore(purchases)
    await store.load()
    purchases.turboActive = .failure(.failed(code: "network"))

    await store.restore()

    #expect(store.notice == .restoreFailed)
  }

  @Test("un nouvel essai efface le message précédent")
  func clearsNotice() async {
    let purchases = FakePurchases(offering: defaultOffering)
    purchases.purchaseReply = .failure(.failed(code: "network"))
    let store = makeStore(purchases)
    await store.load()
    await store.subscribe(monthly)
    purchases.purchaseReply = .success(.cancelled)

    await store.subscribe(monthly)

    #expect(store.notice == nil)
  }
}
