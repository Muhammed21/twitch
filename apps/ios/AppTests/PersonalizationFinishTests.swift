import Domain
import Foundation
import Navigation
import Onboarding
import Paywall
import Preferences
import Testing
@testable import Twitch

@MainActor
private final class EndingRecorder {
  private(set) var endings: [String] = []

  func close() {
    endings.append("home")
  }

  func showPaywall() {
    endings.append("paywall")
  }
}

@MainActor
private final class StubPurchases: Purchases {
  let isAvailable: Bool
  let turbo: Result<Bool, PurchasesFailure>
  let outcome: Result<PurchaseOutcome, PurchasesFailure>
  private(set) var attributes: [String: String] = [:]

  init(
    isAvailable: Bool = true,
    turbo: Result<Bool, PurchasesFailure> = .success(false),
    outcome: Result<PurchaseOutcome, PurchasesFailure> = .success(.cancelled)
  ) {
    self.isAvailable = isAvailable
    self.turbo = turbo
    self.outcome = outcome
  }

  func offering(_: String?) async throws(PurchasesFailure) -> SubscriptionOffering {
    throw .noOffering
  }

  func purchase(_: SubscriptionPackage) async throws(PurchasesFailure) -> PurchaseOutcome {
    try outcome.get()
  }

  func restore() async throws(PurchasesFailure) -> Bool {
    false
  }

  func isTurboActive() async throws(PurchasesFailure) -> Bool {
    try turbo.get()
  }

  func setAttribute(_ value: String, for key: String) {
    attributes[key] = value
  }
  func logIn(_: UUID) async {}
  func logOut() async {}
}

private struct OneCategory: CategoryDirectory {
  func categories(after _: CategoryCursor?) async throws -> CategoryPage {
    try CategoryPage(
      categories: [BrowseCategory(slug: CategorySlug("fortnite"), name: "Fortnite", imageURL: nil, liveCount: 1, viewers: nil)],
      nextCursor: nil
    )
  }
}

private struct AcceptsFollows: CategoryFollowing {
  func follow(_: CategorySlug) async throws {}
  func unfollow(_: CategorySlug) async throws {}
}

private struct NoTags: CategoryTagDirectory {
  func tags() async throws -> [InterestTag] {
    []
  }
}

private struct UndecidedNotifications: NotificationPermission {
  func authorization() async -> NotificationAuthorization {
    .notDetermined
  }

  func request() async -> Bool? {
    false
  }
}

private struct LateVariant: BootstrapSource {
  let variant: String

  func bootstrap() async throws -> AppBootstrap {
    try AppBootstrap(minSupportedVersion: AppVersion("1.0.0"), flags: FeatureFlags(sessionReplay: false, paywallVariant: variant))
  }
}

private let monthly = SubscriptionPackage(id: "$rc_monthly", offeringID: "default", period: .month, localizedPrice: "4,99 €")
private let noLinks = PaywallLinks(terms: nil, privacy: nil)

@MainActor
private func makeLaunch(variant: String) throws -> LaunchStore {
  try LaunchStore(source: LateVariant(variant: variant), currentVersion: AppVersion("1.0.0"))
}

@MainActor
private func purchaseEnding(
  _ purchases: StubPurchases,
  account: UUID,
  preferences: PreferencesStore,
  router: Router,
  recorder: EndingRecorder
) throws -> PaywallStore {
  try PersonalizationRoot.paywallStore(
    PersonalizationPaywall(purchases: purchases, launch: makeLaunch(variant: "control"), links: noLinks),
    onSubscribed: PersonalizationRoot.ending(account: { account }, preferences: preferences, router: router, finish: recorder.close)
  )
}

@MainActor
private func makePreferences() -> PreferencesStore {
  PreferencesStore(repository: InMemoryPreferences(language: .english), onChange: { _ in })
}

@MainActor
private func finish(account: UUID?, preferences: PreferencesStore, purchases: StubPurchases, recorder: EndingRecorder) async {
  await PersonalizationRoot.finish(
    account: account,
    preferences: preferences,
    purchases: purchases,
    showPaywall: recorder.showPaywall,
    close: recorder.close
  )
}

@MainActor
@Suite("Fin du parcours de personnalisation et page 11, le paywall (ADR 0051)")
struct PersonalizationFinishTests {
  @Test("le récap ouvre le paywall sans marquer le parcours, qui doit rester affiché sous le paywall")
  func paywallAfterSummary() async {
    let preferences = makePreferences()
    let recorder = EndingRecorder()
    let account = UUID()

    await finish(account: account, preferences: preferences, purchases: StubPurchases(), recorder: recorder)

    #expect(!preferences.hasCompletedOnboarding(account))
    #expect(recorder.endings == ["paywall"])
  }

  @Test("fermer le paywall marque le parcours terminé pour ce compte, puis mène à l'accueil")
  func closingPaywallCompletes() {
    let preferences = makePreferences()
    let recorder = EndingRecorder()
    let account = UUID()

    PersonalizationRoot.complete(account: account, preferences: preferences, close: recorder.close)

    #expect(preferences.hasCompletedOnboarding(account))
    #expect(!preferences.hasCompletedOnboarding(UUID()))
    #expect(recorder.endings == ["home"])
  }

  @Test("un abonné Turbo passe directement à l'accueil")
  func subscriberGoesHome() async {
    let preferences = makePreferences()
    let recorder = EndingRecorder()
    let account = UUID()

    await finish(account: account, preferences: preferences, purchases: StubPurchases(turbo: .success(true)), recorder: recorder)

    #expect(preferences.hasCompletedOnboarding(account))
    #expect(recorder.endings == ["home"])
  }

  @Test("sans RevenueCat configuré, aucun paywall vide : l'utilisateur passe à l'accueil")
  func unavailableGoesHome() async {
    let recorder = EndingRecorder()

    await finish(account: UUID(), preferences: makePreferences(), purchases: StubPurchases(isAvailable: false), recorder: recorder)

    #expect(recorder.endings == ["home"])
  }

  @Test("un état Turbo illisible n'empêche pas d'ouvrir le paywall")
  func unknownTurboShowsPaywall() async {
    let recorder = EndingRecorder()

    await finish(account: UUID(), preferences: makePreferences(), purchases: StubPurchases(turbo: .failure(.failed(code: "networkError"))), recorder: recorder)

    #expect(recorder.endings == ["paywall"])
  }

  @Test("un compte toujours inconnu ne bloque pas l'utilisateur : le parcours se ferme sans rien marquer")
  func unknownAccountStillCloses() {
    let recorder = EndingRecorder()

    PersonalizationRoot.complete(account: nil, preferences: makePreferences(), close: recorder.close)

    #expect(recorder.endings == ["home"])
  }

  @Test("chaque parcours repart de zéro : ce qu'un compte a suivi ne se coche pas pour le suivant")
  func freshChoicesPerJourney() async throws {
    let sources = PersonalizationSources(
      categories: OneCategory(),
      following: AcceptsFollows(),
      tags: NoTags(),
      notifications: UndecidedNotifications()
    )
    let preferences = makePreferences()
    let fortnite = try CategorySlug("fortnite")
    let first = sources.choices(preferences: preferences)
    await first.categories.load()
    await first.categories.toggle(fortnite)

    let next = sources.choices(preferences: preferences)

    #expect(first.categories.isFollowing(fortnite))
    #expect(!next.categories.isFollowing(fortnite))
    #expect(next.categories.selectionCount == 0)
    #expect(next.categories !== first.categories)
    #expect(next.interests !== first.interests)
    #expect(next.notifications !== first.notifications)
  }

  @Test("une variante arrivée après l'ouverture du parcours est celle envoyée à l'achat (#294)")
  func lateVariantReachesPurchase() async throws {
    let purchases = StubPurchases(outcome: .success(.subscribed))
    let launch = try makeLaunch(variant: "variant_b")
    let store = PersonalizationRoot.paywallStore(
      PersonalizationPaywall(purchases: purchases, launch: launch, links: noLinks),
      onSubscribed: {}
    )

    await launch.run(accountID: UUID())
    await store.subscribe(monthly)

    #expect(purchases.attributes == ["ph_paywall_variant": "variant_b"])
  }

  @Test("un achat réussi marque le parcours terminé pour ce compte et ouvre l'onglet Accueil")
  func purchaseGoesHome() async throws {
    let preferences = makePreferences()
    let recorder = EndingRecorder()
    let router = Router()
    router.selectedTab = .profile
    let account = UUID()
    let purchases = StubPurchases(outcome: .success(.subscribed))
    let store = try purchaseEnding(purchases, account: account, preferences: preferences, router: router, recorder: recorder)

    await store.subscribe(monthly)

    #expect(preferences.hasCompletedOnboarding(account))
    #expect(router.selectedTab == .home)
    #expect(recorder.endings == ["home"])
  }

  @Test("un achat annulé reste sur le paywall, sans terminer le parcours")
  func cancelledPurchaseStays() async throws {
    let preferences = makePreferences()
    let recorder = EndingRecorder()
    let account = UUID()
    let store = try purchaseEnding(StubPurchases(), account: account, preferences: preferences, router: Router(), recorder: recorder)

    await store.subscribe(monthly)

    #expect(!preferences.hasCompletedOnboarding(account))
    #expect(recorder.endings.isEmpty)
    #expect(store.notice == nil)
  }

  @Test("un achat en échec reste sur le paywall et affiche l'erreur")
  func failedPurchaseStays() async throws {
    let preferences = makePreferences()
    let recorder = EndingRecorder()
    let account = UUID()
    let purchases = StubPurchases(outcome: .failure(.failed(code: "payment_pending")))
    let store = try purchaseEnding(purchases, account: account, preferences: preferences, router: Router(), recorder: recorder)

    await store.subscribe(monthly)

    #expect(!preferences.hasCompletedOnboarding(account))
    #expect(recorder.endings.isEmpty)
    #expect(store.notice == .purchaseFailed)
  }

  @Test("« Plus tard » termine aussi le parcours et ouvre l'onglet Accueil")
  func laterGoesHome() {
    let preferences = makePreferences()
    let recorder = EndingRecorder()
    let router = Router()
    router.selectedTab = .browse
    let account = UUID()

    PersonalizationRoot.ending(account: { account }, preferences: preferences, router: router, finish: recorder.close)()

    #expect(preferences.hasCompletedOnboarding(account))
    #expect(router.selectedTab == .home)
    #expect(recorder.endings == ["home"])
  }
}
