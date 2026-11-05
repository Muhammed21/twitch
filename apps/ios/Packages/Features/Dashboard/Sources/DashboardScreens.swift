import DesignSystem
import Navigation
import SwiftUI

public enum DashboardTabs {
  public static let createStyle = TabBarCreateStyle.accent

  public static var leading: [TabBarItem<DashboardTab>] {
    DashboardTab.leading.map(item)
  }

  public static var trailing: [TabBarItem<DashboardTab>] {
    DashboardTab.trailing.map(item)
  }

  private static func item(_ tab: DashboardTab) -> TabBarItem<DashboardTab> {
    TabBarItem(
      tab: tab,
      title: String(localized: DashboardText.title(of: tab)),
      glyph: glyph(of: tab),
      accessibilityIdentifier: "dashboard.\(identifier(of: tab))"
    )
  }

  private static func glyph(of tab: DashboardTab) -> TabBarGlyph {
    switch tab {
    case .home: DashboardTabGlyphs.home
    case .content: DashboardTabGlyphs.content
    case .stats: DashboardTabGlyphs.stats
    case .channel: DashboardTabGlyphs.channel
    }
  }

  private static func identifier(of tab: DashboardTab) -> String {
    switch tab {
    case .home: "home"
    case .content: "content"
    case .stats: "stats"
    case .channel: "channel"
    }
  }
}

public struct DashboardHomeScreen: View {
  private let onWatch: () -> Void

  public init(onWatch: @escaping () -> Void) {
    self.onWatch = onWatch
  }

  public var body: some View {
    VStack(spacing: 0) {
      DashboardHeader(title: String(localized: DashboardText.title(of: .home))) {
        DashboardPillButton(glyph: DashboardStyle.watchGlyph, label: String(localized: DashboardText.watch), action: onWatch)
          .accessibilityIdentifier("dashboard.watch")
      }
      Spacer(minLength: 0)
    }
    .background(ColorRole.background.color.ignoresSafeArea())
  }
}

public struct DashboardStatsScreen: View {
  public init() {}

  public var body: some View {
    VStack(spacing: 0) {
      DashboardHeader(title: String(localized: DashboardText.title(of: .stats))) {
        HStack(spacing: LayoutRole.dashboardIconGap.points) {
          DashboardIconButton(glyph: .calendar, label: String(localized: DashboardText.calendar), isEnabled: false)
          DashboardIconButton(glyph: .info, label: String(localized: DashboardText.info))
        }
        .padding(.trailing, -LayoutRole.dashboardIconOverhang.points)
      }
      DashboardEmptyState(message: String(localized: DashboardText.statsEmpty))
    }
    .background(ColorRole.background.color.ignoresSafeArea())
  }
}

public struct DashboardContentScreen: View {
  @State private var query = ""

  public init() {}

  public var body: some View {
    VStack(spacing: 0) {
      DashboardHeader(title: String(localized: DashboardText.title(of: .content))) {
        Text(DashboardText.sort)
          .font(TextRole.dashboardAction.font)
          .foregroundStyle(ColorRole.textPrimary.color)
      }
      DashboardSearchField(text: $query, prompt: String(localized: DashboardText.search))
      DashboardEmptyState(message: String(localized: DashboardText.contentEmpty))
    }
    .background(ColorRole.background.color.ignoresSafeArea())
  }
}
