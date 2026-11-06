import DesignSystem
import SwiftUI

struct TurboPerkCard: View {
  let perk: PaywallPerk
  let expansion: PaywallPerkExpansion
  let onToggle: () -> Void

  private var isExpanded: Bool {
    expansion.isExpanded(perk)
  }

  var body: some View {
    Button(action: onToggle) {
      HStack(spacing: 0) {
        TurboPerkIcon(perk: perk)
          .frame(width: PaywallLayout.perkIllustrationWidth.points)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: PaywallLayout.perkTitleGap.points) {
          HStack(alignment: .firstTextBaseline, spacing: PaywallLayout.subscribeIconGap.points) {
            Text(perk.title)
              .font(TextRole.paywallHeadline.font)
              .lineLimit(expansion.titleLineLimit(for: perk))
              .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
              .font(TextRole.paywallBody.font)
              .foregroundStyle(ColorRole.textSecondary.color)
              .accessibilityHidden(true)
          }
          Text(perk.detail)
            .font(TextRole.paywallBody.font)
            .lineLimit(expansion.detailLineLimit(for: perk))
        }
        .foregroundStyle(ColorRole.textPrimary.color)
      }
      .multilineTextAlignment(.leading)
      .padding(.leading, PaywallLayout.perkPaddingLeading.points)
      .padding(.trailing, PaywallLayout.perkPaddingTrailing.points)
      .padding(.vertical, PaywallLayout.perkPaddingV.points)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        ColorRole.surfaceTertiary.color,
        in: RoundedRectangle(cornerRadius: PaywallLayout.perkRadius.points)
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityValue(Text(PaywallText.perkState(isExpanded: isExpanded)))
    .accessibilityIdentifier("paywall.perk.\(perk)")
  }
}

private struct TurboPerkIcon: View {
  let perk: PaywallPerk

  var body: some View {
    image
      .foregroundStyle(TurboGradient.fill)
      .frame(width: PaywallLayout.markSize.points, height: PaywallLayout.markSize.points)
  }

  @ViewBuilder private var image: some View {
    switch perk {
    case .badge:
      Glyph.turboBattery.image
        .resizable()
        .scaledToFit()
    case .color:
      Image(systemName: "paintpalette.fill")
        .resizable()
        .scaledToFit()
    }
  }
}
