import DesignSystem
import Domain
import SwiftUI

struct PaywallPerks: View {
  var body: some View {
    JourneyChoiceCard {
      PaywallPerkRow(title: PaywallText.badgePerk, detail: PaywallText.badgePerkDetail) {
        Glyph.turboBattery.image
          .resizable()
          .scaledToFit()
      }
      JourneyChoiceDivider()
      PaywallPerkRow(title: PaywallText.colorPerk, detail: PaywallText.colorPerkDetail) {
        Image(systemName: "paintpalette.fill")
          .font(TextRole.display.font)
      }
    }
  }
}

struct PaywallPerkRow<Icon: View>: View {
  let title: LocalizedStringResource
  let detail: LocalizedStringResource
  @ViewBuilder let icon: Icon

  var body: some View {
    HStack(spacing: LayoutRole.menuRowPadding.points) {
      icon
        .foregroundStyle(TurboGradient.fill)
        .frame(width: LayoutRole.journeyControlSize.points, height: LayoutRole.journeyControlSize.points)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 0) {
        Text(title)
          .font(TextRole.journeyChoiceName.font)
          .foregroundStyle(JourneyStyle.choiceName.color)
        Text(detail)
          .font(TextRole.journeyChoiceDetail.font)
          .foregroundStyle(JourneyStyle.choiceDetail.color)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .multilineTextAlignment(.leading)
    .padding(.horizontal, LayoutRole.menuRowPadding.points)
    .padding(.vertical, LayoutRole.editRowPadding.points)
    .accessibilityElement(children: .combine)
  }
}

struct PaywallPlans: View {
  let packages: [SubscriptionPackage]
  let selected: SubscriptionPackage?
  let savings: Int?
  let onSelect: (SubscriptionPackage) -> Void

  var body: some View {
    JourneyChoiceCard {
      ForEach(Array(packages.enumerated()), id: \.element.id) { index, package in
        if index > 0 {
          JourneyChoiceDivider()
        }
        Button { onSelect(package) } label: {
          PaywallPlanRow(package: package, isSelected: package == selected, savings: package.period == .year ? savings : nil)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("paywall.plan.\(package.id)")
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text(PaywallText.choosePlan))
  }
}

struct PaywallPlanRow: View {
  let package: SubscriptionPackage
  let isSelected: Bool
  let savings: Int?

  var body: some View {
    HStack(spacing: LayoutRole.menuRowPadding.points) {
      HStack(spacing: LayoutRole.journeyChipGap.points) {
        Text(PaywallText.plan(package.period))
          .font(TextRole.journeyChoiceName.font)
          .foregroundStyle(JourneyStyle.choiceName.color)
        if let savings {
          PaywallSavingsBadge(percent: savings)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Text(package.localizedPrice)
        .font(TextRole.journeyChoiceName.font)
        .foregroundStyle(JourneyStyle.choiceName.color)
      Image(systemName: JourneyCheckRow.symbol)
        .font(TextRole.journeyRowTitle.font)
        .foregroundStyle(JourneyStyle.check.color)
        .opacity(isSelected ? 1 : 0)
        .accessibilityHidden(true)
    }
    .multilineTextAlignment(.leading)
    .padding(.horizontal, LayoutRole.menuRowPadding.points)
    .padding(.vertical, LayoutRole.editRowPadding.points)
    .frame(minHeight: LayoutRole.actionHeight.points)
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
  }
}

struct PaywallSavingsBadge: View {
  let percent: Int

  var body: some View {
    Text(PaywallText.savings(percent))
      .font(TextRole.tag.font)
      .foregroundStyle(ColorRole.onAccent.color)
      .padding(.horizontal, PaywallLayout.savingsPaddingH.points)
      .padding(.vertical, PaywallLayout.savingsPaddingV.points)
      .background(TurboGradient.fill, in: Capsule())
  }
}
