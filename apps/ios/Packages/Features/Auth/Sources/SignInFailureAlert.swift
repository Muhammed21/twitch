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
}
