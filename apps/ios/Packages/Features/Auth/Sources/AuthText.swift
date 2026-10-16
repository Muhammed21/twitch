import Foundation

public enum AuthText {
  public static var logOut: String { String(localized: "auth.logOut", bundle: .module) }
  public static var logOutQuestion: String { String(localized: "auth.logOutQuestion", bundle: .module) }
  public static var logOutConfirm: String { String(localized: "auth.logOutConfirm", bundle: .module) }
  public static var cancel: String { String(localized: "auth.cancel", bundle: .module) }
  public static var signInFailedTitle: String { String(localized: "auth.signInFailedTitle", bundle: .module) }
  public static var signInFailedMessage: String { String(localized: "auth.signInFailedMessage", bundle: .module) }
  public static var dismiss: String { String(localized: "auth.dismiss", bundle: .module) }
}
