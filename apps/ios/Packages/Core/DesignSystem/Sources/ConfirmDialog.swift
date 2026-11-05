import SwiftUI

public struct DialogAction {
  public let title: String
  public let kind: ActionButtonKind
  public let run: @MainActor () -> Void

  public init(title: String, kind: ActionButtonKind, run: @escaping @MainActor () -> Void) {
    self.title = title
    self.kind = kind
    self.run = run
  }
}

public struct ConfirmDialog: View {
  private let title: String?
  private let message: String
  private let actions: [DialogAction]

  public init(title: String? = nil, message: String, actions: [DialogAction]) {
    self.title = title
    self.message = message
    self.actions = actions
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
        Text(message)
          .font(TextRole.dialogMessage.font)
        VStack(spacing: LayoutRole.dialogActionGap.points) {
          ForEach(actions, id: \.title) { action in
            Button(action.title) { action.run() }
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
