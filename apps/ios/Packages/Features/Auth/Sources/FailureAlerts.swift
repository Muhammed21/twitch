import SwiftUI

public extension View {
  func signInFailureAlert(_ session: SessionStore) -> some View {
    alert(
      AuthText.signInFailedTitle,
      isPresented: Binding(
        get: { session.hasSignInFailure },
        set: { isPresented in if !isPresented { session.dismissSignInFailure() } }
      )
    ) {
      Button(AuthText.dismiss, role: .cancel) {}
    } message: {
      Text(AuthText.signInFailedMessage)
    }
  }

  func logOutFailureAlert(_ session: SessionStore) -> some View {
    alert(
      AuthText.logOutFailedTitle,
      isPresented: Binding(
        get: { session.hasLogOutFailure },
        set: { isPresented in if !isPresented { session.dismissLogOutFailure() } }
      )
    ) {
      Button(AuthText.dismiss, role: .cancel) {}
    } message: {
      Text(AuthText.logOutFailedMessage)
    }
  }
}
