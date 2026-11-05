import Auth
import Foundation
import Networking
import Onboarding

enum RootScreen: Equatable {
  case splash
  case welcome
  case allSet
  case personalization
  case signedIn
  case updateRequired

  init(
    isSplashVisible: Bool,
    phase: SessionPhase,
    isGreetingNewAccount: Bool,
    isUpdateRequired: Bool,
    isPersonalizationDue: Bool = false
  ) {
    switch (isSplashVisible, phase) {
    case (true, _): self = .splash
    case (false, _) where isUpdateRequired: self = .updateRequired
    case (false, .launching): self = .splash
    case (false, .signedOut), (false, .signingIn): self = .welcome
    case (false, .signedIn) where isGreetingNewAccount: self = .allSet
    case (false, .signedIn): self = isPersonalizationDue ? .personalization : .signedIn
    }
  }

  static func isPersonalizationDue(isPersonalizing: Bool, account: UUID?, hasCompleted: (UUID) -> Bool) -> Bool {
    guard isPersonalizing else { return false }
    guard let account else { return true }
    return !hasCompleted(account)
  }

  static func resetsNavigation(from old: SessionPhase, to new: SessionPhase) -> Bool {
    switch (old, new) {
    case (.signedIn, .signedIn): false
    case (.signedIn, _): true
    default: false
    }
  }
}

extension AuthorizationIntent {
  init(_ intent: WelcomeIntent) {
    switch intent {
    case .logIn: self = .signIn
    case .signUp: self = .signUp
    }
  }
}
