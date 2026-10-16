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
    ZStack {
      ColorRole.scrim.color
        .ignoresSafeArea()
        .accessibilityHidden(true)
      VStack(spacing: 0) {
        if let title {
          Text(title)
            .font(TextRole.dialogTitle.font)
            .padding(.bottom, LayoutRole.dialogTitleGap.points)
        }
        Text(AuthText.logOutQuestion)
          .font(TextRole.dialogMessage.font)
        VStack(spacing: LayoutRole.dialogActionGap.points) {
          ForEach(LogOutDialogContent.actions, id: \.title) { action in
            Button(action.title) { onChoice(action.choice) }
              .buttonStyle(ActionButtonStyle(action.kind))
          }
        }
        .padding(.top, LayoutRole.dialogActionsTop.points)
      }
      .multilineTextAlignment(.center)
      .foregroundStyle(ColorRole.textPrimary.color)
      .padding(LayoutRole.dialogPadding.points)
      .frame(width: LayoutRole.dialogWidth.points)
      .background(
        ColorRole.surface.color,
        in: RoundedRectangle(cornerRadius: LayoutRole.dialogRadius.points, style: .continuous)
      )
      .accessibilityAddTraits(.isModal)
    }
  }
}
