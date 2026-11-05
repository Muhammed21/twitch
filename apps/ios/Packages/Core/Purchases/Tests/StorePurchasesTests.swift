import Domain
import Foundation
@testable import Purchases
import Testing

private let viewerID = UUID(uuidString: "6F9619FF-8B86-D011-B42D-00C04FC964FF") ?? UUID()

private func makePackage(_ id: String, in offering: String, period: SubscriptionPeriod = .month) -> SubscriptionPackage {
  SubscriptionPackage(id: id, offeringID: offering, period: period, localizedPrice: "4,99 €", price: 4.99)
}

private func makeOffering(_ id: String) -> SubscriptionOffering {
  SubscriptionOffering(id: id, packages: [makePackage("$rc_monthly", in: id), makePackage("$rc_annual", in: id, period: .year)])
}

private struct StoreDown: Error {}

@MainActor
private final class FakeBackend: PurchasesBackend {
  enum Call: Equatable {
    case logIn(String)
    case logOut
    case purchase(String, String)
    case attributes([String: String])
  }

  private(set) var calls: [Call] = []
  var catalog = StoreOfferings(current: "default", all: ["default": makeOffering("default")])
  var purchaseReply: Result<StorePurchaseResult, PurchasesBackendError> = .success(StorePurchaseResult(cancelled: false, entitlements: ["turbo"]))
  var entitlements: Result<Set<String>, PurchasesBackendError> = .success([])
  var failsIdentity = false

  func offerings() async throws(PurchasesBackendError) -> StoreOfferings {
    catalog
  }

  func purchase(_ package: SubscriptionPackage) async throws(PurchasesBackendError) -> StorePurchaseResult {
    calls.append(.purchase(package.offeringID, package.id))
    return try purchaseReply.get()
  }

  func restore() async throws(PurchasesBackendError) -> Set<String> {
    try entitlements.get()
  }

  func activeEntitlements() async throws(PurchasesBackendError) -> Set<String> {
    try entitlements.get()
  }

  func setAttributes(_ attributes: [String: String]) {
    calls.append(.attributes(attributes))
  }

  func logIn(_ appUserID: String) async throws(PurchasesBackendError) {
    calls.append(.logIn(appUserID))
    if failsIdentity { throw .failed(code: "network") }
  }

  func logOut() async throws(PurchasesBackendError) {
    calls.append(.logOut)
    if failsIdentity { throw .failed(code: "anonymous") }
  }
}

@MainActor
@Suite("Core/Purchases : RevenueCat derrière le protocole Purchases (plan onboarding-paywall, PR 24)")
struct StorePurchasesTests {
  @Test("la connexion identifie RevenueCat avec l'ID utilisateur de la session, comme PostHog identify")
  func logIn() async {
    let backend = FakeBackend()
    let purchases = StorePurchases(backend: backend)

    await purchases.logIn(viewerID)

    #expect(backend.calls == [.logIn("6f9619ff-8b86-d011-b42d-00c04fc964ff")])
  }

  @Test("la déconnexion appelle logOut")
  func logOut() async {
    let backend = FakeBackend()
    let purchases = StorePurchases(backend: backend)

    await purchases.logOut()

    #expect(backend.calls == [.logOut])
  }

  @Test("un échec de logIn ou de logOut ne remonte pas à la session")
  func identityFailureIsQuiet() async {
    let backend = FakeBackend()
    backend.failsIdentity = true
    let purchases = StorePurchases(backend: backend)

    await purchases.logIn(viewerID)
    await purchases.logOut()

    #expect(backend.calls == [.logIn("6f9619ff-8b86-d011-b42d-00c04fc964ff"), .logOut])
  }

  @Test("l'offering demandé est rendu quand il existe")
  func requestedOffering() async throws {
    let backend = FakeBackend()
    backend.catalog = StoreOfferings(current: "default", all: ["default": makeOffering("default"), "annual_first": makeOffering("annual_first")])
    let purchases = StorePurchases(backend: backend)

    #expect(try await purchases.offering("annual_first") == makeOffering("annual_first"))
  }

  @Test("un offering absent, ou aucun demandé, se replie sur l'offering courant", arguments: ["inconnu", nil] as [String?])
  func fallsBackToCurrent(requested: String?) async throws {
    let purchases = StorePurchases(backend: FakeBackend())

    #expect(try await purchases.offering(requested) == makeOffering("default"))
  }

  @Test("sans offering courant ni demandé, l'offre manque")
  func noOffering() async {
    let backend = FakeBackend()
    backend.catalog = StoreOfferings(current: nil, all: [:])
    let purchases = StorePurchases(backend: backend)

    await #expect(throws: PurchasesFailure.noOffering) { try await purchases.offering(nil) }
  }

  @Test("un achat qui débloque l'entitlement turbo abonne")
  func subscribed() async throws {
    let backend = FakeBackend()
    let purchases = StorePurchases(backend: backend)

    let outcome = try await purchases.purchase(makePackage("$rc_annual", in: "default", period: .year))

    #expect(outcome == .subscribed)
    #expect(backend.calls == [.purchase("default", "$rc_annual")])
  }

  @Test("un achat annulé dans StoreKit est une annulation, pas une erreur")
  func cancelled() async throws {
    let backend = FakeBackend()
    backend.purchaseReply = .success(StorePurchaseResult(cancelled: true, entitlements: []))
    let purchases = StorePurchases(backend: backend)

    #expect(try await purchases.purchase(makePackage("$rc_monthly", in: "default")) == .cancelled)
  }

  @Test("un achat qui ne débloque pas turbo échoue avec un code")
  func purchaseWithoutTurbo() async {
    let backend = FakeBackend()
    backend.purchaseReply = .success(StorePurchaseResult(cancelled: false, entitlements: []))
    let purchases = StorePurchases(backend: backend)

    await #expect(throws: PurchasesFailure.failed(code: "entitlement_missing")) {
      try await purchases.purchase(makePackage("$rc_monthly", in: "default"))
    }
  }

  @Test("un échec du store remonte avec son code")
  func purchaseFailed() async {
    let backend = FakeBackend()
    backend.purchaseReply = .failure(.failed(code: "payment_pending"))
    let purchases = StorePurchases(backend: backend)

    await #expect(throws: PurchasesFailure.failed(code: "payment_pending")) {
      try await purchases.purchase(makePackage("$rc_monthly", in: "default"))
    }
  }

  @Test("restaurer et lire l'état disent si turbo est actif", arguments: [(Set(["turbo"]), true), (Set(["autre"]), false), (Set<String>(), false)])
  func turboState(entitlements: Set<String>, active: Bool) async throws {
    let backend = FakeBackend()
    backend.entitlements = .success(entitlements)
    let purchases = StorePurchases(backend: backend)

    #expect(try await purchases.restore() == active)
    #expect(try await purchases.isTurboActive() == active)
  }

  @Test("un attribut d'abonné est transmis tel quel")
  func attribute() {
    let backend = FakeBackend()
    let purchases = StorePurchases(backend: backend)

    purchases.setAttribute("annual_first", for: "ph_paywall_variant")

    #expect(backend.calls == [.attributes(["ph_paywall_variant": "annual_first"])])
  }

  @Test("sans clé SDK, le service se dit indisponible et ne plante pas")
  func unavailable() async {
    let purchases = StorePurchases(backend: nil)

    #expect(purchases.isAvailable == false)
    await #expect(throws: PurchasesFailure.unavailable) { try await purchases.offering(nil) }
    await #expect(throws: PurchasesFailure.unavailable) { try await purchases.purchase(makePackage("$rc_monthly", in: "default")) }
    await #expect(throws: PurchasesFailure.unavailable) { try await purchases.restore() }
    await #expect(throws: PurchasesFailure.unavailable) { try await purchases.isTurboActive() }
    purchases.setAttribute("x", for: "y")
    await purchases.logIn(viewerID)
    await purchases.logOut()
  }
}

@Suite("Clé SDK RevenueCat lue dans Info.plist")
struct PurchasesConfigurationTests {
  @Test("la clé publique est lue sous REVENUECAT_API_KEY")
  func key() {
    #expect(PurchasesConfiguration(info: ["REVENUECAT_API_KEY": "test_abc"])?.apiKey == "test_abc")
  }

  @Test("une clé absente, vide ou qui n'est pas du texte ne configure rien")
  func missing() {
    #expect(PurchasesConfiguration(info: [:]) == nil)
    #expect(PurchasesConfiguration(info: ["REVENUECAT_API_KEY": "  "]) == nil)
    #expect(PurchasesConfiguration(info: ["REVENUECAT_API_KEY": 3]) == nil)
  }
}
