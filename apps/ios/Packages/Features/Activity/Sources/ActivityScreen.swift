import DesignSystem
import SwiftUI

public struct ActivityScreen: View {
  @State private var tab = ActivityTab.initial

  public init() {}

  public var body: some View {
    VStack(spacing: 0) {
      ActivityHeader(title: String(localized: ActivityText.title))
      BrowseTabs(selection: $tab, items: ActivityTab.allCases.map(\.item))
        .padding(.horizontal, LayoutRole.screenInset.points)
        .padding(.top, LayoutRole.screenInset.points)
      ActivityEmptyState(
        title: String(localized: tab.empty.title),
        message: String(localized: tab.empty.message),
        illustration: tab.empty.illustration,
        action: tab.empty.action.map { label in
          ActivityEmptyAction(
            label: String(localized: label),
            isEnabled: ActivityEmpty.isActionEnabled,
            accessibilityIdentifier: "activity.whispers.startConversation"
          )
        }
      )
      .accessibilityIdentifier("activity.empty")
    }
    .background(ColorRole.background.color.ignoresSafeArea())
    .toolbar(.hidden, for: .navigationBar)
  }
}

private extension ActivityTab {
  var item: BrowseTabItem<ActivityTab> {
    BrowseTabItem(tab: self, title: String(localized: title), accessibilityIdentifier: accessibilityIdentifier)
  }
}
