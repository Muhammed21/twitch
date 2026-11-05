import Auth
import DesignSystem
import Testing

@Suite("Modale de déconnexion, fidèle à parametres/menu-parametres--modale-deconnexion")
struct LogOutDialogTests {
  @Test("Logout, rouge, confirme la déconnexion ; Cancel, gris clair, l'abandonne")
  func actions() {
    #expect(LogOutDialogContent.actions == [
      LogOutAction(title: shown(english: "Logout", french: "Déconnexion"), kind: .destructive, choice: .logOut),
      LogOutAction(title: shown(english: "Cancel", french: "Annuler"), kind: .cancel, choice: .cancel),
    ])
  }

  @Test("la question et le bouton de l'écran connecté reprennent les textes de la capture, en anglais et en français")
  func texts() {
    #expect(AuthText.logOutQuestion == shown(english: "Are you sure you want to log out?", french: "Voulez-vous vraiment vous déconnecter\u{00A0}?"))
    #expect(AuthText.logOut == shown(english: "Log Out", french: "Se déconnecter"))
  }

  @Test("l'alerte d'échec de connexion suit la langue de l'interface")
  func failureTexts() {
    #expect(AuthText.signInFailedTitle == shown(english: "Couldn't Log In", french: "Impossible de se connecter"))
    #expect(AuthText.signInFailedMessage == shown(english: "Something went wrong. Please try again.", french: "Un problème est survenu. Veuillez réessayer."))
    #expect(AuthText.dismiss == "OK")
  }

  @Test("l'alerte d'échec de déconnexion suit la langue de l'interface")
  func logOutFailureTexts() {
    #expect(AuthText.logOutFailedTitle == shown(english: "Couldn't Log Out", french: "Impossible de se déconnecter"))
    #expect(AuthText.logOutFailedMessage == shown(english: "Something went wrong. Please try again.", french: "Un problème est survenu. Veuillez réessayer."))
  }
}
