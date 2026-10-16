import DesignSystem
import SwiftUI

@main
struct TwitchApp: App {
  @State private var isSplashVisible = true

  var body: some Scene {
    WindowGroup {
      ZStack {
        ColorRole.background.color.ignoresSafeArea()
        if isSplashVisible {
          SplashScreen { isSplashVisible = false }
        }
      }
    }
  }
}
