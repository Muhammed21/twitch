import DesignSystem
import Domain
import SwiftUI

public enum PaywallPresentation: Sendable {
  case journey
  case pushed

  public var showsJourneyHeader: Bool {
    self == .journey
  }

  public var showsPlanPicker: Bool {
    self == .journey
  }

  public var title: LocalizedStringResource? {
    switch self {
    case .journey: nil
    case .pushed: PaywallText.title
    }
  }
}

public struct PaywallScreen: View {
  @State private var store: PaywallStore
  private let links: PaywallLinks
  private let presentation: PaywallPresentation
  private let onClose: () -> Void

  public init(
    store: PaywallStore,
    links: PaywallLinks,
    presentation: PaywallPresentation = .journey,
    onClose: @escaping () -> Void = {}
  ) {
    _store = State(initialValue: store)
    self.links = links
    self.presentation = presentation
    self.onClose = onClose
  }

  public var body: some View {
    VStack(spacing: 0) {
      if presentation.showsJourneyHeader { header }
      content
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .background(ColorRole.background.color.ignoresSafeArea())
    .modifier(PaywallNavigation(title: presentation.title))
    .task { await store.load() }
  }

  private var header: some View {
    HStack(spacing: LayoutRole.journeyHeaderGap.points) {
      Color.clear
        .frame(width: LayoutRole.journeyControlSize.points, height: LayoutRole.journeyControlSize.points)
      JourneyProgressBar(progress: 1)
        .accessibilityHidden(true)
      Button(String(localized: PaywallText.later), action: onClose)
        .font(TextRole.journeyControl.font)
        .foregroundStyle(JourneyStyle.skip.color)
        .accessibilityIdentifier("paywall.close")
    }
    .padding(.horizontal, LayoutRole.screenInset.points)
    .frame(height: LayoutRole.journeyHeaderHeight.points)
  }

  @ViewBuilder private var content: some View {
    switch store.phase {
    case .loading:
      ProgressView()
    case .unavailable:
      message(PaywallText.unavailable)
    case .subscribed:
      ScrollView { pitch(PaywallText.subscribedTitle, PaywallText.subscribedMessage) }
    case let .ready(offering):
      if presentation.showsPlanPicker {
        offer(offering)
      } else {
        TurboPage(offering: offering, store: store, links: links)
      }
    }
  }

  private func offer(_ offering: SubscriptionOffering) -> some View {
    VStack(spacing: 0) {
      ScrollView {
        VStack(spacing: 0) {
          pitch(PaywallText.headline, PaywallText.tagline)
          VStack(spacing: LayoutRole.journeyContentGap.points) {
            PaywallPerks()
            PaywallPlans(
              packages: offering.packages,
              selected: store.selected,
              savings: PaywallOffer.annualSavings(in: offering),
              onSelect: store.select
            )
          }
          .padding(.top, LayoutRole.journeyContentGap.points)
          .padding(.horizontal, LayoutRole.screenInset.points)
        }
      }
      .scrollIndicators(.hidden)
      actions
    }
  }

  private var actions: some View {
    VStack(spacing: PaywallLayout.legalGap.points) {
      if let notice = store.notice {
        Text(PaywallText.notice(notice))
          .font(TextRole.paywallLegal.font)
          .foregroundStyle(ColorRole.danger.color)
          .accessibilityIdentifier("paywall.notice")
      }
      subscribeButton
      Button(String(localized: PaywallText.restore)) { Task { await store.restore() } }
        .font(TextRole.paywallLegal.font)
        .tint(ColorRole.link.color)
        .disabled(isBusy)
        .accessibilityIdentifier("paywall.restore")
      Text(PaywallText.legal(terms: links.terms, privacy: links.privacy))
        .font(TextRole.paywallLegal.font)
        .foregroundStyle(ColorRole.textSecondary.color)
        .tint(ColorRole.link.color)
    }
    .multilineTextAlignment(.center)
    .padding(.top, LayoutRole.journeyMessageGap.points)
    .padding([.horizontal, .bottom], LayoutRole.screenInset.points)
  }

  @ViewBuilder private var subscribeButton: some View {
    if let package = store.selected {
      Button { Task { await store.subscribe(package) } } label: {
        if store.purchasing == nil {
          Text(PaywallText.subscribe(package))
        } else {
          ProgressView()
        }
      }
      .buttonStyle(ActionButtonStyle(.primary))
      .disabled(isBusy)
      .accessibilityIdentifier("paywall.subscribe.\(package.id)")
      Text(PaywallText.billing(package.period))
        .font(TextRole.paywallLegal.font)
        .foregroundStyle(ColorRole.textSecondary.color)
    }
  }

  private var isBusy: Bool {
    store.purchasing != nil || store.isRestoring
  }

  private func pitch(_ title: LocalizedStringResource, _ detail: LocalizedStringResource) -> some View {
    VStack(spacing: 0) {
      TurboMarkBand()
      Text(title)
        .font(TextRole.journeyTitle.font)
        .foregroundStyle(JourneyStyle.title.color)
        .accessibilityAddTraits(.isHeader)
        .padding(.top, PaywallLayout.headlineTop.points)
        .padding(.horizontal, LayoutRole.screenInset.points)
      Text(detail)
        .font(TextRole.journeyMessage.font)
        .foregroundStyle(JourneyStyle.message.color)
        .padding(.top, LayoutRole.journeyMessageGap.points)
        .padding(.horizontal, LayoutRole.screenInset.points)
    }
    .multilineTextAlignment(.center)
  }

  private func message(_ text: LocalizedStringResource) -> some View {
    Text(text)
      .font(TextRole.journeyMessage.font)
      .foregroundStyle(JourneyStyle.message.color)
      .multilineTextAlignment(.center)
      .padding(.horizontal, LayoutRole.screenInset.points)
      .accessibilityIdentifier("paywall.unavailable")
  }
}

private struct PaywallNavigation: ViewModifier {
  let title: LocalizedStringResource?

  func body(content: Content) -> some View {
    if let title {
      content
        .navigationTitle(Text(title))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
    } else {
      content
    }
  }
}
