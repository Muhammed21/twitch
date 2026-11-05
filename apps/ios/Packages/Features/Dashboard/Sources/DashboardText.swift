import DesignSystem
import Foundation
import Navigation

public enum DashboardText {
  public static let streaming = LocalizedStringResource("createActions.streaming", bundle: .module)
  public static let streamingDetail = LocalizedStringResource("createActions.streaming.detail", bundle: .module)
  public static let recapClips = LocalizedStringResource("createActions.recapClips", bundle: .module)
  public static let recapClipsUnavailable = LocalizedStringResource("createActions.recapClips.unavailable", bundle: .module)
  public static let cancel = LocalizedStringResource("createActions.cancel", bundle: .module)

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
