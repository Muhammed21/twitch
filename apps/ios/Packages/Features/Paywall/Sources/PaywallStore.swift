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

    public var isAboutRestore: Bool {
      self != .purchaseFailed
    }
  }

  public private(set) var phase: Phase = .loading
  public private(set) var notice: Notice?
  public private(set) var purchasing: SubscriptionPackage?
  public private(set) var selected: SubscriptionPackage?
  public private(set) var isRestoring = false

  private let purchases: any Purchases
  private let offeringID: String?
  private let funnel: PaywallFunnel
  private let onSubscribed: @MainActor () -> Void

  public init(
    purchases: any Purchases,
    offeringID: String?,
    variant: @escaping @MainActor () -> String? = { nil },
    placement: AnalyticsPlacement = .onboarding,
    analytics: any Analytics,
    onSubscribed: @escaping @MainActor () -> Void = {}
  ) {
    self.purchases = purchases
    self.offeringID = offeringID
    funnel = PaywallFunnel(variant: variant, placement: placement, analytics: analytics)
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
      funnel.viewed(offering)
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
    let variant = funnel.currentVariant
    if let variant {
      purchases.setAttribute(variant, for: "ph_paywall_variant")
    }
    funnel.started(package, variant: variant)
    let outcome = await outcome(of: package)
    funnel.ended(package, variant: variant, outcome: outcome)
    switch outcome {
    case .success(.subscribed): subscribed()
    case .success(.cancelled): break
    case .failure: notice = .purchaseFailed
    }
  }

  public func dismiss() {
    funnel.dismissed()
  }

  public func restore() async {
    guard purchasing == nil, !isRestoring else { return }
    notice = nil
    isRestoring = true
    defer { isRestoring = false }
    do {
      let isActive = try await purchases.restore()
      funnel.restored(hasActiveEntitlement: isActive)
      if isActive {
        subscribed()
      } else {
        notice = .nothingToRestore
      }
    } catch {
      notice = .restoreFailed
    }
  }

  private func outcome(of package: SubscriptionPackage) async -> Result<PurchaseOutcome, PurchasesFailure> {
    do {
      return try await .success(purchases.purchase(package))
    } catch {
      return .failure(error)
    }
  }

  private func subscribed() {
    funnel.subscribed()
    phase = .subscribed
    onSubscribed()
  }
}
