import DesignSystem
import Domain
import SwiftUI

struct TurboMarkBand: View {
  var body: some View {
    TurboBand()
      .overlay(alignment: .top) {
        Glyph.turboBattery.image
          .resizable()
          .scaledToFit()
          .frame(width: PaywallLayout.markSize.points)
          .foregroundStyle(ColorRole.onAccent.color)
          .padding(.top, PaywallLayout.headlineTop.points)
          .accessibilityHidden(true)
      }
  }
}

struct TurboPage: View {
  let offering: SubscriptionOffering
  let store: PaywallStore
  let links: PaywallLinks
  @State private var expansion: PaywallPerkExpansion

  init(offering: SubscriptionOffering, store: PaywallStore, links: PaywallLinks, expansion: PaywallPerkExpansion = .init()) {
    self.offering = offering
    self.store = store
    self.links = links
    _expansion = State(initialValue: expansion)
  }

  var body: some View {
    ScrollView { content }
      .scrollIndicators(.hidden)
  }

  var content: some View {
    VStack(spacing: 0) {
      TurboMarkBand()
      pitch
      if let package = PaywallOffer.featured(in: offering) {
        TurboSubscribeButton(package: package, store: store)
          .padding(.top, PaywallLayout.subscribeTop.points)
        finePrint(package)
      }
      perks
      restore
    }
  }

  private var pitch: some View {
    VStack(spacing: PaywallLayout.taglineTop.points) {
      Text(PaywallText.headline)
        .font(TextRole.paywallHeadline.font)
        .accessibilityAddTraits(.isHeader)
      Text(PaywallText.tagline)
        .font(TextRole.paywallBody.font)
    }
    .foregroundStyle(ColorRole.textPrimary.color)
    .multilineTextAlignment(.center)
    .padding(.top, PaywallLayout.headlineTop.points)
    .padding(.horizontal, LayoutRole.screenInset.points)
  }

  private func finePrint(_ package: SubscriptionPackage) -> some View {
    VStack(spacing: PaywallLayout.finePrintGap.points) {
      Text(PaywallText.legal(terms: links.terms, privacy: links.privacy))
        .tint(ColorRole.link.color)
      Text(PaywallText.billing(package.period))
      if let notice = store.notice, !notice.isAboutRestore {
        noticeText(notice)
      }
    }
    .font(TextRole.paywallFinePrint.font)
    .foregroundStyle(ColorRole.textSecondary.color)
    .multilineTextAlignment(.center)
    .padding(.top, PaywallLayout.finePrintTop.points)
    .padding(.horizontal, LayoutRole.screenInset.points)
  }

  private var perks: some View {
    VStack(spacing: PaywallLayout.perkGap.points) {
      ForEach(PaywallPerk.allCases, id: \.self) { perk in
        TurboPerkCard(perk: perk, expansion: expansion) {
          expansion = expansion.toggling(perk)
        }
      }
    }
    .padding(.top, PaywallLayout.perksTop.points)
    .padding(.horizontal, LayoutRole.screenInset.points)
  }

  private var restore: some View {
    VStack(spacing: PaywallLayout.finePrintGap.points) {
      Button(String(localized: PaywallText.restore)) { Task { await store.restore() } }
        .tint(ColorRole.link.color)
        .disabled(store.purchasing != nil || store.isRestoring)
        .accessibilityIdentifier("paywall.restore")
      if let notice = store.notice, notice.isAboutRestore {
        noticeText(notice)
      }
    }
    .font(TextRole.paywallFinePrint.font)
    .multilineTextAlignment(.center)
    .padding(.top, PaywallLayout.perksTop.points)
    .padding(.horizontal, LayoutRole.screenInset.points)
    .padding(.bottom, LayoutRole.screenInset.points)
  }

  private func noticeText(_ notice: PaywallStore.Notice) -> some View {
    Text(PaywallText.notice(notice))
      .foregroundStyle(ColorRole.danger.color)
      .accessibilityIdentifier("paywall.notice")
  }
}

struct TurboSubscribeButton: View {
  let package: SubscriptionPackage
  let store: PaywallStore

  var body: some View {
    Button { Task { await store.subscribe(package) } } label: {
      HStack(spacing: PaywallLayout.subscribeIconGap.points) {
        Glyph.turboBattery.image
          .resizable()
          .scaledToFit()
          .frame(width: PaywallLayout.subscribeIconSize.points)
          .accessibilityHidden(true)
        Text(PaywallText.subscribe(package))
      }
      .opacity(store.purchasing == nil ? 1 : 0)
      .overlay {
        if store.purchasing != nil {
          ProgressView()
            .tint(ColorRole.onAccent.color)
        }
      }
      .font(TextRole.actionLabel.font)
      .foregroundStyle(ColorRole.onAccent.color)
      .multilineTextAlignment(.center)
      .padding(.horizontal, PaywallLayout.subscribePaddingH.points)
      .frame(minHeight: LayoutRole.actionHeight.points)
      .background(
        ColorRole.accent.color,
        in: RoundedRectangle(cornerRadius: PaywallLayout.subscribeRadius.points)
      )
    }
    .buttonStyle(.plain)
    .disabled(store.purchasing != nil || store.isRestoring)
    .subscribeAccessibility(package, isPurchasing: store.purchasing != nil)
    .padding(.horizontal, LayoutRole.screenInset.points)
    .accessibilityIdentifier("paywall.subscribe.\(package.id)")
  }
}

extension View {
  func subscribeAccessibility(_ package: SubscriptionPackage, isPurchasing: Bool) -> some View {
    accessibilityLabel(Text(PaywallText.subscribe(package)))
      .accessibilityValue(PaywallText.purchasing(isPurchasing).map { Text($0) } ?? Text(verbatim: ""))
  }
}
