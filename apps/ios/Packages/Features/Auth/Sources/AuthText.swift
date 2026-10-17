import Foundation

public enum AuthText {
  public static var logOut: String { String(localized: "auth.logOut", bundle: .module) }
  public static var logOutQuestion: String { String(localized: "auth.logOutQuestion", bundle: .module) }
  public static var logOutConfirm: String { String(localized: "auth.logOutConfirm", bundle: .module) }
  public static var cancel: String { String(localized: "auth.cancel", bundle: .module) }
  public static var signInFailedTitle: String { String(localized: "auth.signInFailedTitle", bundle: .module) }
  public static var signInFailedMessage: String { String(localized: "auth.signInFailedMessage", bundle: .module) }
  public static var logOutFailedTitle: String { String(localized: "auth.logOutFailedTitle", bundle: .module) }
  public static var logOutFailedMessage: String { String(localized: "auth.logOutFailedMessage", bundle: .module) }
  public static var accountVerification: String { String(localized: "auth.accountVerification", bundle: .module) }
  public static var allSetTitle: String { String(localized: "auth.allSetTitle", bundle: .module) }
  public static var allSetMessage: String { String(localized: "auth.allSetMessage", bundle: .module) }
  public static var done: String { String(localized: "auth.done", bundle: .module) }
  public static var dismiss: String { String(localized: "auth.dismiss", bundle: .module) }
}
