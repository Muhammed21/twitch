import Auth
import DesignSystem
import Domain
import Foundation
import Navigation
import Networking
import Onboarding
import Paywall
import Preferences
import SwiftUI

@MainActor
@Observable
final class PaywallPresentation {
  var isShown = false
}

struct PersonalizationRoot: View {
  static let steps: [PersonalizationStep] = [
    .intro, .categories, .interests, .contentPreferences, .liveLanguage, .appearance, .videoAutoplay, .notifications, .chat,
    .summary,
  ]

  @State private var journey: PersonalizationJourney
  @State private var categories: CategoryChoices
  @State private var interests: InterestChoices
  @State private var notifications: NotificationChoices
  @State private var presentation: PaywallPresentation
  @State private var paywall: PaywallStore
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  private let links: PaywallLinks
  private let onClose: () -> Void

  init(
    session: SessionStore,
    preferences: PreferencesStore,
    sources: PersonalizationSources,
    paywall: PersonalizationPaywall,
    router: Router
  ) {
    let choices = sources.choices(preferences: preferences, analytics: paywall.analytics)
    _categories = State(initialValue: choices.categories)
    _interests = State(initialValue: choices.interests)
    _notifications = State(initialValue: choices.notifications)
    let presentation = PaywallPresentation()
    let purchases = paywall.purchases
    let ending = Self.ending(account: { session.accountID }, preferences: preferences, router: router, finish: session.finishPersonalization)
    _presentation = State(initialValue: presentation)
    _paywall = State(initialValue: Self.paywallStore(paywall, onSubscribed: ending))
    links = paywall.links
    onClose = ending
    _journey = State(initialValue: PersonalizationJourney(
      steps: Self.steps,
      now: { Date.now },
      analytics: paywall.analytics,
      onFinish: {
        Task {
          await Self.finish(
            account: session.accountID,
            preferences: preferences,
            purchases: purchases,
            showPaywall: { presentation.isShown = true },
            close: ending
          )
        }
      }
    ))
  }

  var body: some View {
    ZStack {
      if presentation.isShown {
        PaywallScreen(store: paywall, links: links, presentation: .journey(onClose: onClose))
          .transition(PaywallStepTransition(reduceMotion: reduceMotion))
      } else {
        PersonalizationScreen()
          .environment(journey)
          .environment(categories)
          .environment(interests)
          .environment(notifications)
          .transition(PaywallStepTransition(reduceMotion: reduceMotion))
      }
    }
    .clipped()
    .background(ColorRole.background.color.ignoresSafeArea())
    .animation(MotionRole.journeyPage, value: presentation.isShown)
  }

  @MainActor
  static func finish(
    account: UUID?,
    preferences: PreferencesStore,
    purchases: any Purchases,
    showPaywall: () -> Void,
    close: () -> Void
  ) async {
    guard await TurboOffer.isOffered(by: purchases) else {
      complete(account: account, preferences: preferences, close: close)
      return
    }
    showPaywall()
  }

  @MainActor
  static func complete(account: UUID?, preferences: PreferencesStore, close: () -> Void) {
    if let account {
      preferences.completeOnboarding(account)
    }
    close()
  }

  @MainActor
  static func ending(
    account: @escaping @MainActor () -> UUID?,
    preferences: PreferencesStore,
    router: Router,
    finish: @escaping @MainActor () -> Void
  ) -> @MainActor () -> Void {
    {
      complete(account: account(), preferences: preferences) {
        router.selectedTab = .home
        finish()
      }
    }
  }

  @MainActor
  static func paywallStore(
    _ paywall: PersonalizationPaywall,
    placement: AnalyticsPlacement = .onboarding,
    onSubscribed: @escaping @MainActor () -> Void
  ) -> PaywallStore {
    PaywallStore(
      purchases: paywall.purchases,
      offeringID: nil,
      variant: paywall.variant,
      placement: placement,
      analytics: paywall.analytics,
      onSubscribed: onSubscribed
    )
  }

  @MainActor
  static func preferences(analytics: any Analytics) -> PreferencesStore {
    PreferencesStore(
      repository: UserDefaultsPreferences(suiteName: nil, language: LiveLanguage(localeIdentifier: Locale.current.identifier)),
      analytics: analytics
    )
  }
}

struct PaywallStepTransition: Transition {
  let reduceMotion: Bool

  func body(content: Content, phase: TransitionPhase) -> some View {
    let shift = JourneyMotion.pageShift(phase: phase, direction: .forward, reduceMotion: reduceMotion)
    content
      .visualEffect { effect, proxy in
        effect.offset(x: shift * proxy.size.width)
      }
      .opacity(JourneyMotion.pageOpacity(phase: phase, reduceMotion: reduceMotion))
  }
}

struct PersonalizationPaywall {
  let purchases: any Purchases
  let variant: @MainActor () -> String?
  let links: PaywallLinks
  let analytics: any Analytics

  init(purchases: any Purchases, launch: LaunchStore, links: PaywallLinks, analytics: any Analytics) {
    self.purchases = purchases
    variant = { launch.flags.paywallVariant }
    self.links = links
    self.analytics = analytics
  }
}

struct PersonalizationSources {
  let categories: any CategoryDirectory
  let following: any CategoryFollowing
  let tags: any CategoryTagDirectory
  let notifications: any NotificationPermission

  @MainActor
  func choices(preferences: PreferencesStore, analytics: any Analytics) -> PersonalizationChoices {
    PersonalizationChoices(
      categories: CategoryChoices(directory: categories, following: following),
      interests: InterestChoices(tags: tags, preferences: preferences),
      notifications: NotificationChoices(permission: notifications, analytics: analytics)
    )
  }
}

struct PersonalizationChoices {
  let categories: CategoryChoices
  let interests: InterestChoices
  let notifications: NotificationChoices
}

extension Composition {
  static func personalizationSources(
    apiBaseURL: URL,
    transport: ClientVersionTransport,
    tokens: OAuthSession,
    now: @escaping @Sendable () -> Date
  ) -> PersonalizationSources {
    PersonalizationSources(
      categories: CategoryDirectoryClient(apiBaseURL: apiBaseURL, transport: transport),
      following: CategoryFollowClient(apiBaseURL: apiBaseURL, transport: transport, tokens: tokens, now: now),
      tags: CategoryTagClient(apiBaseURL: apiBaseURL, transport: transport),
      notifications: SystemNotificationPermission()
    )
  }
}
