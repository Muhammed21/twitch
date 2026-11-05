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
  private let onStreamManager: () -> Void
  private let onEditStreamInfo: () -> Void

  public nonisolated static var statItems: [DashboardStatItem] {
    DashboardStat.allCases.map { stat in
      DashboardStatItem(
        id: "\(stat)",
        value: String(localized: DashboardText.unavailableStat),
        label: String(localized: DashboardText.label(of: stat))
      )
    }
  }

  public init(
    onWatch: @escaping () -> Void,
    onStreamManager: @escaping () -> Void,
    onEditStreamInfo: @escaping () -> Void
  ) {
    self.onWatch = onWatch
    self.onStreamManager = onStreamManager
    self.onEditStreamInfo = onEditStreamInfo
  }

  public var body: some View {
    VStack(spacing: 0) {
      DashboardHeader(title: String(localized: DashboardText.title(of: .home))) {
        DashboardPillButton(glyph: DashboardStyle.watchGlyph, label: String(localized: DashboardText.watch), action: onWatch)
          .accessibilityIdentifier("dashboard.watch")
      }
      ScrollView {
        VStack(spacing: 0) {
          DashboardStatsCard(items: Self.statItems)
            .padding(.horizontal, LayoutRole.screenInset.points)
          DashboardStreamCard(
            offlineLabel: String(localized: DashboardText.offline),
            primaryLabel: String(localized: DashboardText.streamManager),
            secondaryLabel: String(localized: DashboardText.editStreamInfo),
            onPrimary: onStreamManager,
            onSecondary: onEditStreamInfo
          )
          .padding(.horizontal, LayoutRole.screenInset.points)
          .padding(.top, LayoutRole.dashboardCardGap.points)
          DashboardHint(text: String(localized: DashboardText.streamManagerHint))
          DashboardActivityCard(
            message: String(localized: DashboardText.noRecentActivity),
            linkLabel: String(localized: DashboardText.seeAllActivity)
          )
          .padding(.horizontal, LayoutRole.screenInset.points)
          .padding(.top, LayoutRole.dashboardCardGap.points)
        }
        .padding(.top, LayoutRole.dashboardCardsTop.points)
      }
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
      DashboardEmptyState(message: String(localized: DashboardText.statsEmpty), illustration: .stats)
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
      DashboardEmptyState(message: String(localized: DashboardText.contentEmpty), illustration: .content)
    }
    .background(ColorRole.background.color.ignoresSafeArea())
  }
}
