import DesignSystem
import Onboarding
import SwiftUI

@main
struct TwitchApp: App {
  @State private var isSplashVisible = true

  var body: some Scene {
    WindowGroup {
      if isSplashVisible {
        ZStack {
          ColorRole.accent.color.ignoresSafeArea()
          SplashScreen { isSplashVisible = false }
        }
      } else {
        WelcomeScreen { _ in }
      }
    }
  }
}
