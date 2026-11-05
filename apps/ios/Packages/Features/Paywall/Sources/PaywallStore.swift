import Domain
import Observation

@MainActor
@Observable
public final class PaywallStore {
  public enum Phase: Equatable, Sendable {
    case loading
    case ready(SubscriptionOffering)
    case subscribed
    case unavailable
  }

  public enum Notice: Equatable, Sendable {
    case purchaseFailed
    case nothingToRestore
    case restoreFailed
  }

  public private(set) var phase: Phase = .loading
  public private(set) var notice: Notice?
  public private(set) var purchasing: SubscriptionPackage?
  public private(set) var isRestoring = false

  private let purchases: any Purchases
  private let offeringID: String?
  private let variant: String?

  public init(purchases: any Purchases, offeringID: String?, variant: String? = nil) {
    self.purchases = purchases
    self.offeringID = offeringID
    self.variant = variant
  }

  public func load() async {
    guard purchases.isAvailable else {
      phase = .unavailable
      return
    }
    if await (try? purchases.isTurboActive()) == true {
      phase = .subscribed
      return
    }
    do {
      phase = try await .ready(purchases.offering(offeringID))
    } catch {
      phase = .unavailable
    }
  }

  public func subscribe(_ package: SubscriptionPackage) async {
    guard purchasing == nil, !isRestoring else { return }
    notice = nil
    purchasing = package
    defer { purchasing = nil }
    if let variant {
      purchases.setAttribute(variant, for: "ph_paywall_variant")
    }
    do {
      if try await purchases.purchase(package) == .subscribed {
        phase = .subscribed
      }
    } catch {
      notice = .purchaseFailed
    }
  }

  public func restore() async {
    guard purchasing == nil, !isRestoring else { return }
    notice = nil
    isRestoring = true
    defer { isRestoring = false }
    do {
      if try await purchases.restore() {
        phase = .subscribed
      } else {
        notice = .nothingToRestore
      }
    } catch {
      notice = .restoreFailed
    }
  }
}
