import DesignSystem
import Navigation
import SwiftUI

public struct CreateActionsSheet: View {
  @Environment(CreatorMode.self) private var creatorMode
  private let onStream: () -> Void

  public init(onStream: @escaping () -> Void) {
    self.onStream = onStream
  }

  public var body: some View {
    let row = ModeSwitchRow(creatorMode.switchAction)
    CreateSheet {
      CreateSheetHero(title: String(localized: DashboardText.streaming), detail: String(localized: DashboardText.streamingDetail)) {
        creatorMode.dismissActions()
        onStream()
      }
      .accessibilityIdentifier("createActions.streaming")
      CreateSheetRow(
        title: String(localized: DashboardText.recapClips),
        detail: String(localized: DashboardText.recapClipsUnavailable),
        isEnabled: false
      ) {}
        .accessibilityIdentifier("createActions.recapClips")
      CreateSheetRow(title: String(localized: row.title), detail: String(localized: row.detail), glyph: row.glyph) {
        Task { await creatorMode.switchMode() }
      }
      .accessibilityIdentifier("createActions.switchMode")
      CreateSheetCancel(label: String(localized: DashboardText.cancel)) {
        creatorMode.dismissActions()
      }
      .accessibilityIdentifier("createActions.cancel")
    }
  }
}

public struct ModeTransition: View {
  private let target: AppMode

  public init(to target: AppMode) {
    self.target = target
  }

  public var body: some View {
    ModeTransitionScreen(title: String(localized: DashboardText.transition(to: target)))
  }
}
