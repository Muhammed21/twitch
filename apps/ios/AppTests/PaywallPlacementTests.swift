import Domain
import Foundation
import Paywall
import Testing
@testable import Twitch

@MainActor
private final class CapturedEvents: Analytics {
  private(set) var all: [AnalyticsEvent] = []

  func capture(_ event: AnalyticsEvent) {
    all.append(event)
  }
}

@MainActor
private final class OfferedTurbo: Purchases {
  let isAvailable = true

  func offering(_: String?) async throws(PurchasesFailure) -> SubscriptionOffering {
    SubscriptionOffering(id: "turbo", packages: [
      SubscriptionPackage(id: "$rc_monthly", offeringID: "turbo", period: .month, localizedPrice: "4,99 €", price: 4.99),
    ])
  }

  func purchase(_: SubscriptionPackage) async throws(PurchasesFailure) -> PurchaseOutcome {
    .cancelled
  }

  func restore() async throws(PurchasesFailure) -> Bool {
    false
  }

  func isTurboActive() async throws(PurchasesFailure) -> Bool {
    false
  }

  func setAttribute(_: String, for _: String) {}
  func logIn(_: UUID) async {}
  func logOut() async {}
}

@MainActor
private func makePaywall(analytics: CapturedEvents) async throws -> PersonalizationPaywall {
  let launch = try LaunchStore(source: VariantBootstrap(), currentVersion: AppVersion("1.0.0"))
  await launch.run(accountID: UUID())
  return PersonalizationPaywall(
    purchases: OfferedTurbo(),
    launch: launch,
    links: PaywallLinks(terms: nil, privacy: nil),
    analytics: analytics
  )
}

private struct VariantBootstrap: BootstrapSource {
  func bootstrap() async throws -> AppBootstrap {
    try AppBootstrap(minSupportedVersion: AppVersion("1.0.0"), flags: FeatureFlags(sessionReplay: false, paywallVariant: "variant_b"))
  }
}

@MainActor
@Suite("Paywall Turbo : l'emplacement de l'offre dans PostHog (ADR 0051, §7)")
struct PaywallPlacementTests {
  @Test("le paywall de fin de parcours se mesure avec placement onboarding")
  func journey() async throws {
    let analytics = CapturedEvents()
    let store = try await PersonalizationRoot.paywallStore(makePaywall(analytics: analytics), onSubscribed: {})

    await store.load()

    #expect(analytics.all == [.paywallViewed(variant: "variant_b", offeringID: "turbo", placement: .onboarding)])
  }

  @Test("le paywall ouvert depuis le profil se mesure avec placement profile")
  func profile() async throws {
    let analytics = CapturedEvents()
    let store = try await ViewerProfileTab.paywallStore(makePaywall(analytics: analytics), onSubscribed: {})

    await store.load()
    store.dismiss()

    #expect(analytics.all == [
      .paywallViewed(variant: "variant_b", offeringID: "turbo", placement: .profile),
      .paywallDismissed(variant: "variant_b", placement: .profile),
    ])
  }
}
