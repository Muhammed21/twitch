import DesignSystem
import Domain
import SwiftUI

public struct SignedInScreen: View {
  @Environment(SessionStore.self) private var session
  @State private var isConfirmingLogOut = false

  public init() {}

  public var body: some View {
    VStack(alignment: .leading) {
      if let account {
        Text(account.name)
          .font(TextRole.display.font)
          .foregroundStyle(ColorRole.textPrimary.color)
        Text(account.email)
          .font(TextRole.body.font)
          .foregroundStyle(ColorRole.textSecondary.color)
      }
      Spacer(minLength: 0)
      Button(AuthText.logOut) { isConfirmingLogOut = true }
        .buttonStyle(ActionButtonStyle(.secondary))
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(LayoutRole.screenInset.points)
    .background(ColorRole.background.color.ignoresSafeArea())
    .overlay {
      if isConfirmingLogOut {
        LogOutDialog(title: account?.name) { choice in
          isConfirmingLogOut = false
          Task { await session.resolveLogOut(choice) }
        }
      }
    }
  }

  private var account: Account? {
    guard case let .signedIn(account) = session.phase else { return nil }
    return account
  }
}
