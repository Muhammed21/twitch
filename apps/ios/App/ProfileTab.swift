import Auth
import Domain
import Navigation
import Paywall
import Profile
import SwiftUI

enum TurboOffer {
  @MainActor
  static func isOffered(by purchases: any Purchases) async -> Bool {
    guard purchases.isAvailable else { return false }
    return await (try? purchases.isTurboActive()) != true
  }
}

struct ViewerProfileTab: View {
  let account: Account?
  let paywall: PersonalizationPaywall
  @Environment(Router.self) private var router
  @Environment(CreatorMode.self) private var creatorMode
  @Environment(SessionStore.self) private var session
  @State private var isTurboOffered = false
  @State private var isShowingPaywall = false

  var body: some View {
    ProfileScreen(account: account, actions: ProfileActions(
      onOpenChannel: { router.push(.channel($0)) },
      onAccountSaved: { session.accountSaved($0) },
      onStreamManager: { router.create() },
      onAnalytics: { Task { await creatorMode.switchMode(landingOn: .stats) } },
      onTryAdFree: isTurboOffered ? { isShowingPaywall = true } : nil
    )) {
      SignedInScreen()
    }
    .task { isTurboOffered = await TurboOffer.isOffered(by: paywall.purchases) }
    .fullScreenCover(isPresented: $isShowingPaywall) {
      ProfilePaywall(
        paywall: paywall,
        onClose: { isShowingPaywall = false },
        onSubscribed: {
          isTurboOffered = false
          isShowingPaywall = false
        }
      )
    }
  }

  static func paywallStore(_ paywall: PersonalizationPaywall, onSubscribed: @escaping @MainActor () -> Void) -> PaywallStore {
    PersonalizationRoot.paywallStore(paywall, placement: .profile, onSubscribed: onSubscribed)
  }
}

private struct ProfilePaywall: View {
  @State private var store: PaywallStore
  private let links: PaywallLinks
  private let onClose: () -> Void

  init(paywall: PersonalizationPaywall, onClose: @escaping () -> Void, onSubscribed: @escaping @MainActor () -> Void) {
    _store = State(initialValue: ViewerProfileTab.paywallStore(paywall, onSubscribed: onSubscribed))
    links = paywall.links
    self.onClose = onClose
  }

  var body: some View {
    PaywallScreen(store: store, links: links, onClose: onClose)
  }
}
