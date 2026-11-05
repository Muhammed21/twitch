import DesignSystem
import SwiftUI

public struct LogOutAction: Equatable, Sendable {
  public let title: String
  public let kind: ActionButtonKind
  public let choice: LogOutChoice

  public init(title: String, kind: ActionButtonKind, choice: LogOutChoice) {
    self.title = title
    self.kind = kind
    self.choice = choice
  }
}

public enum LogOutDialogContent {
  public static var actions: [LogOutAction] {
    [
      LogOutAction(title: AuthText.logOutConfirm, kind: .destructive, choice: .logOut),
      LogOutAction(title: AuthText.cancel, kind: .cancel, choice: .cancel),
    ]
  }
}

public struct LogOutDialog: View {
  private let title: String?
  private let onChoice: @MainActor (LogOutChoice) -> Void

  public init(title: String?, onChoice: @escaping @MainActor (LogOutChoice) -> Void) {
    self.title = title
    self.onChoice = onChoice
  }

  public var body: some View {
    ConfirmDialog(
      title: title,
      message: AuthText.logOutQuestion,
      actions: LogOutDialogContent.actions.map { action in
        DialogAction(title: action.title, kind: action.kind) { onChoice(action.choice) }
      }
    )
  }
}
