import Auth
import DesignSystem
import Testing

@Suite("Modale de déconnexion, fidèle à parametres/menu-parametres--modale-deconnexion")
struct LogOutDialogTests {
  @Test("Logout, rouge, confirme la déconnexion ; Cancel, gris clair, l'abandonne")
  func actions() {
    #expect(LogOutDialogContent.actions == [
      LogOutAction(title: "Logout", kind: .destructive, choice: .logOut),
      LogOutAction(title: "Cancel", kind: .cancel, choice: .cancel),
    ])
  }

  @Test("la question et le bouton de l'écran connecté reprennent les textes anglais de la capture")
  func texts() {
    #expect(AuthText.logOutQuestion == "Are you sure you want to log out?")
    #expect(AuthText.logOut == "Log Out")
  }

  @Test("l'alerte d'échec de connexion est en anglais, comme l'interface")
  func failureTexts() {
    #expect(AuthText.signInFailedTitle == "Couldn't Log In")
    #expect(AuthText.signInFailedMessage == "Something went wrong. Please try again.")
    #expect(AuthText.dismiss == "OK")
  }

  @Test("l'alerte d'échec de déconnexion est en anglais, comme l'interface")
  func logOutFailureTexts() {
    #expect(AuthText.logOutFailedTitle == "Couldn't Log Out")
    #expect(AuthText.logOutFailedMessage == "Something went wrong. Please try again.")
  }
}
