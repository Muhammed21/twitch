import Domain
import Foundation

@MainActor
public final class FakePurchases: Purchases {
  public enum Call: Equatable {
    case offering(String?)
    case purchase(SubscriptionPackage)
    case restore
    case isTurboActive
    case attribute(key: String, value: String)
    case logIn(UUID)
    case logOut
  }

  public private(set) var calls: [Call] = []
  public var isAvailable: Bool
  public var offerings: Result<SubscriptionOffering, PurchasesFailure>
  public var purchaseReply: Result<PurchaseOutcome, PurchasesFailure> = .success(.subscribed)
  public var turboActive: Result<Bool, PurchasesFailure> = .success(false)
  public var holdsPurchases = false
  private var held: CheckedContinuation<Void, Never>?

  public init(offering: SubscriptionOffering, isAvailable: Bool = true) {
    offerings = .success(offering)
    self.isAvailable = isAvailable
  }

  public func offering(_ id: String?) async throws(PurchasesFailure) -> SubscriptionOffering {
    calls.append(.offering(id))
    return try offerings.get()
  }

  public func purchase(_ package: SubscriptionPackage) async throws(PurchasesFailure) -> PurchaseOutcome {
    calls.append(.purchase(package))
    if holdsPurchases {
      await withCheckedContinuation { held = $0 }
    }
    return try purchaseReply.get()
  }

  public func waitForHeldPurchase() async {
    while held == nil {
      await Task.yield()
    }
  }

  public func releasePurchase() {
    held?.resume()
    held = nil
  }

  public func restore() async throws(PurchasesFailure) -> Bool {
    calls.append(.restore)
    return try turboActive.get()
  }

  public func isTurboActive() async throws(PurchasesFailure) -> Bool {
    calls.append(.isTurboActive)
    return try turboActive.get()
  }

  public func setAttribute(_ value: String, for key: String) {
    calls.append(.attribute(key: key, value: value))
  }

  public func logIn(_ userID: UUID) async {
    calls.append(.logIn(userID))
  }

  public func logOut() async {
    calls.append(.logOut)
  }
}
