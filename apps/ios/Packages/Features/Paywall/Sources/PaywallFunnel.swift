import Domain

@MainActor
final class PaywallFunnel {
  private enum Exposure {
    case hidden
    case viewed(variant: String)
    case closed
  }

  private var exposure = Exposure.hidden
  private let variant: @MainActor () -> String?
  private let placement: AnalyticsPlacement
  private let analytics: any Analytics

  init(variant: @escaping @MainActor () -> String?, placement: AnalyticsPlacement, analytics: any Analytics) {
    self.variant = variant
    self.placement = placement
    self.analytics = analytics
  }

  var currentVariant: String? {
    variant()
  }

  func viewed(_ offering: SubscriptionOffering) {
    guard case .hidden = exposure, let variant = variant() else { return }
    exposure = .viewed(variant: variant)
    analytics.capture(.paywallViewed(variant: variant, offeringID: offering.id, placement: placement))
  }

  func dismissed() {
    guard case let .viewed(variant) = exposure else { return }
    exposure = .closed
    analytics.capture(.paywallDismissed(variant: variant, placement: placement))
  }

  func subscribed() {
    exposure = .closed
  }

  func started(_ package: SubscriptionPackage, variant: String?) {
    guard let variant else { return }
    analytics.capture(.purchaseStarted(productID: package.id, variant: variant))
  }

  func ended(_ package: SubscriptionPackage, variant: String?, outcome: Result<PurchaseOutcome, PurchasesFailure>) {
    guard let variant else { return }
    analytics.capture(Self.event(package, variant: variant, outcome: outcome))
  }

  func restored(hasActiveEntitlement: Bool) {
    analytics.capture(.purchaseRestored(hasActiveEntitlement: hasActiveEntitlement))
  }

  private static func event(
    _ package: SubscriptionPackage,
    variant: String,
    outcome: Result<PurchaseOutcome, PurchasesFailure>
  ) -> AnalyticsEvent {
    switch outcome {
    case .success(.subscribed): .purchaseCompleted(productID: package.id, variant: variant)
    case .success(.cancelled): .purchaseCancelled(productID: package.id, variant: variant)
    case let .failure(failure): .purchaseFailed(productID: package.id, variant: variant, errorCode: errorCode(failure))
    }
  }

  private static func errorCode(_ failure: PurchasesFailure) -> String {
    switch failure {
    case .unavailable: "unavailable"
    case .noOffering: "no_offering"
    case let .failed(code): code.isEmpty ? "unknown" : code
    }
  }
}
