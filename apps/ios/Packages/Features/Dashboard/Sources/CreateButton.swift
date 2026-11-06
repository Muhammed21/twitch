import DesignSystem
import Foundation

public enum CreateButton {
  public static func tabBarCreate(
    accessibilityIdentifier: String,
    style: TabBarCreateStyle = .neutral,
    action: @escaping () -> Void
  ) -> TabBarCreate {
    TabBarCreate(
      label: String(localized: DashboardText.createButton),
      hint: String(localized: DashboardText.createButtonHint),
      accessibilityIdentifier: accessibilityIdentifier,
      style: style,
      action: action
    )
  }
}
