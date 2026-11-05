import DesignSystem
import Domain
import SwiftUI

public struct PaywallScreen: View {
  @State private var store: PaywallStore
  private let links: PaywallLinks
  private let onClose: () -> Void

  public init(store: PaywallStore, links: PaywallLinks, onClose: @escaping () -> Void) {
    _store = State(initialValue: store)
    self.links = links
    self.onClose = onClose
  }

  public var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 0) {
          TurboBand()
          content
        }
      }
      .background(ColorRole.background.color.ignoresSafeArea())
      .navigationTitle(Text(PaywallText.title))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(String(localized: PaywallText.close), action: onClose)
            .accessibilityIdentifier("paywall.close")
        }
      }
      .task { await store.load() }
    }
  }

  @ViewBuilder private var content: some View {
    switch store.phase {
    case .loading:
      ProgressView()
        .padding(.top, PaywallLayout.actionTop.points)
    case .unavailable:
      message(PaywallText.unavailable)
    case .subscribed:
      headline(PaywallText.subscribedTitle, PaywallText.subscribedMessage)
    case let .ready(offering):
      offer(offering)
    }
  }

  private func offer(_ offering: SubscriptionOffering) -> some View {
    VStack(spacing: 0) {
      headline(PaywallText.headline, PaywallText.tagline)
      VStack(spacing: PaywallLayout.packageGap.points) {
        ForEach(Array(offering.packages.enumerated()), id: \.element.id) { index, package in
          packageButton(package, kind: index == 0 ? .primary : .secondary)
        }
      }
      .padding(.top, PaywallLayout.actionTop.points)
      .padding(.horizontal, PaywallLayout.buttonInset.points - LayoutRole.screenInset.points)
      Text(PaywallText.legal(terms: links.terms, privacy: links.privacy))
        .font(TextRole.paywallLegal.font)
        .foregroundStyle(ColorRole.textSecondary.color)
        .tint(ColorRole.link.color)
        .padding(.top, PaywallLayout.legalGap.points)
      if let notice = store.notice {
        Text(PaywallText.notice(notice))
          .font(TextRole.paywallLegal.font)
          .foregroundStyle(ColorRole.danger.color)
          .padding(.top, PaywallLayout.legalGap.points)
          .accessibilityIdentifier("paywall.notice")
      }
      perks
      Button(String(localized: PaywallText.restore)) { Task { await store.restore() } }
        .font(TextRole.paywallLegal.font)
        .tint(ColorRole.link.color)
        .disabled(store.purchasing != nil || store.isRestoring)
        .padding(.top, PaywallLayout.cardTop.points)
        .accessibilityIdentifier("paywall.restore")
    }
    .multilineTextAlignment(.center)
    .padding(.horizontal, LayoutRole.screenInset.points)
    .padding(.bottom, PaywallLayout.cardTop.points)
  }

  private func packageButton(_ package: SubscriptionPackage, kind: ActionButtonKind) -> some View {
    VStack(spacing: PaywallLayout.billingGap.points) {
      Button { Task { await store.subscribe(package) } } label: {
        if store.purchasing == package {
          ProgressView()
        } else {
          Text(PaywallText.subscribe(package))
        }
      }
      .buttonStyle(ActionButtonStyle(kind))
      .disabled(store.purchasing != nil || store.isRestoring)
      .accessibilityIdentifier("paywall.subscribe.\(package.id)")
      Text(PaywallText.billing(package.period))
        .font(TextRole.paywallLegal.font)
        .foregroundStyle(ColorRole.textSecondary.color)
    }
  }

  private var perks: some View {
    Text(PaywallText.perks)
      .font(TextRole.paywallBody.font)
      .foregroundStyle(ColorRole.textPrimary.color)
      .multilineTextAlignment(.leading)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(PaywallLayout.cardPadding.points)
      .background(ColorRole.surfaceTertiary.color, in: RoundedRectangle(cornerRadius: LayoutRole.menuCardRadius.points))
      .padding(.top, PaywallLayout.cardTop.points)
  }

  private func headline(_ title: LocalizedStringResource, _ detail: LocalizedStringResource) -> some View {
    VStack(spacing: PaywallLayout.taglineGap.points) {
      Text(title)
        .font(TextRole.paywallHeadline.font)
      Text(detail)
        .font(TextRole.paywallBody.font)
    }
    .foregroundStyle(ColorRole.textPrimary.color)
    .multilineTextAlignment(.center)
    .padding(.top, PaywallLayout.headlineTop.points)
    .padding(.horizontal, LayoutRole.screenInset.points)
  }

  private func message(_ text: LocalizedStringResource) -> some View {
    Text(text)
      .font(TextRole.paywallBody.font)
      .foregroundStyle(ColorRole.textSecondary.color)
      .multilineTextAlignment(.center)
      .padding(.top, PaywallLayout.actionTop.points)
      .padding(.horizontal, LayoutRole.screenInset.points)
      .accessibilityIdentifier("paywall.unavailable")
  }
}
