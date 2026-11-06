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
  public private(set) var selected: SubscriptionPackage?
  public private(set) var isRestoring = false

  private let purchases: any Purchases
  private let offeringID: String?
  private let variant: @MainActor () -> String?
  private let analytics: any Analytics
  private let onSubscribed: @MainActor () -> Void

  public init(
    purchases: any Purchases,
    offeringID: String?,
    variant: @escaping @MainActor () -> String? = { nil },
    analytics: any Analytics,
    onSubscribed: @escaping @MainActor () -> Void = {}
  ) {
    self.purchases = purchases
    self.offeringID = offeringID
    self.variant = variant
    self.analytics = analytics
    self.onSubscribed = onSubscribed
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
      let offering = try await purchases.offering(offeringID)
      selected = PaywallOffer.preferred(in: offering)
      phase = .ready(offering)
    } catch {
      phase = .unavailable
    }
  }

  public func select(_ package: SubscriptionPackage) {
    guard purchasing == nil, !isRestoring else { return }
    selected = package
  }

  public func subscribe(_ package: SubscriptionPackage) async {
    guard purchasing == nil, !isRestoring else { return }
    notice = nil
    purchasing = package
    defer { purchasing = nil }
    let variant = variant()
    if let variant {
      purchases.setAttribute(variant, for: "ph_paywall_variant")
    }
    do {
      if try await purchases.purchase(package) == .subscribed {
        completed(package, variant: variant)
        subscribed()
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
        subscribed()
      } else {
        notice = .nothingToRestore
      }
    } catch {
      notice = .restoreFailed
    }
  }

  private func completed(_ package: SubscriptionPackage, variant: String?) {
    guard let variant else { return }
    analytics.capture(.purchaseCompleted(productID: package.id, variant: variant))
  }

  private func subscribed() {
    phase = .subscribed
    onSubscribed()
  }
}
