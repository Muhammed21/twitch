import DesignSystem
import Foundation
import Navigation

public enum DashboardStat: CaseIterable, Sendable {
  case streamTime, viewers, followers
}

public enum DashboardText {
  public static let streaming = LocalizedStringResource("createActions.streaming", bundle: .module)
  public static let streamingDetail = LocalizedStringResource("createActions.streaming.detail", bundle: .module)
  public static let recapClips = LocalizedStringResource("createActions.recapClips", bundle: .module)
  public static let recapClipsUnavailable = LocalizedStringResource("createActions.recapClips.unavailable", bundle: .module)
  public static let cancel = LocalizedStringResource("createActions.cancel", bundle: .module)
  public static let watch = LocalizedStringResource("dashboard.home.watch", bundle: .module)
  public static let statsEmpty = LocalizedStringResource("dashboard.stats.empty", bundle: .module)
  public static let calendar = LocalizedStringResource("dashboard.stats.calendar", bundle: .module)
  public static let info = LocalizedStringResource("dashboard.stats.info", bundle: .module)
  public static let contentEmpty = LocalizedStringResource("dashboard.content.empty", bundle: .module)
  public static let sort = LocalizedStringResource("dashboard.content.sort", bundle: .module)
  public static let search = LocalizedStringResource("dashboard.content.search", bundle: .module)
  public static let unavailableStat = LocalizedStringResource("dashboard.home.stat.unavailable", bundle: .module)
  public static let unavailableStatSpoken = LocalizedStringResource("dashboard.home.stat.unavailable.spoken", bundle: .module)
  public static let offline = LocalizedStringResource("dashboard.home.offline", bundle: .module)
  public static let streamManager = LocalizedStringResource("dashboard.home.streamManager", bundle: .module)
  public static let editStreamInfo = LocalizedStringResource("dashboard.home.editStreamInfo", bundle: .module)
  public static let streamManagerHint = LocalizedStringResource("dashboard.home.streamManager.hint", bundle: .module)
  public static let noRecentActivity = LocalizedStringResource("dashboard.home.activity.empty", bundle: .module)
  public static let seeAllActivity = LocalizedStringResource("dashboard.home.activity.seeAll", bundle: .module)

  public static func label(of stat: DashboardStat) -> LocalizedStringResource {
    switch stat {
    case .streamTime: LocalizedStringResource("dashboard.home.stat.streamTime", bundle: .module)
    case .viewers: LocalizedStringResource("dashboard.home.stat.viewers", bundle: .module)
    case .followers: LocalizedStringResource("dashboard.home.stat.followers", bundle: .module)
    }
  }

  public static func title(of tab: DashboardTab) -> LocalizedStringResource {
    switch tab {
    case .home: LocalizedStringResource("dashboard.tab.home", bundle: .module)
    case .content: LocalizedStringResource("dashboard.tab.content", bundle: .module)
    case .stats: LocalizedStringResource("dashboard.tab.stats", bundle: .module)
    case .channel: LocalizedStringResource("dashboard.tab.channel", bundle: .module)
    }
  }

  public static func transition(to mode: AppMode) -> LocalizedStringResource {
    switch mode {
    case .creator: LocalizedStringResource("modeTransition.creator", bundle: .module)
    case .viewer: LocalizedStringResource("modeTransition.viewer", bundle: .module)
    }
  }
}

public struct ModeSwitchRow {
  public let title: LocalizedStringResource
  public let detail: LocalizedStringResource
  public let glyph: Glyph?

  public init(_ action: ModeSwitchAction) {
    switch action {
    case .enterDashboard:
      title = LocalizedStringResource("createActions.enterDashboard", bundle: .module)
      detail = LocalizedStringResource("createActions.enterDashboard.detail", bundle: .module)
      glyph = nil
    case .leaveDashboard:
      title = LocalizedStringResource("createActions.leaveDashboard", bundle: .module)
      detail = LocalizedStringResource("createActions.leaveDashboard.detail", bundle: .module)
      glyph = CreateSheetStyle.leaveGlyph
    }
  }
}
