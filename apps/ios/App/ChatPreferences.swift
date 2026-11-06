import Chat
import Preferences
import SwiftUI

private struct ChatPreferences: ViewModifier {
  @Environment(PreferencesStore.self) private var preferences

  func body(content: Content) -> some View {
    content.environment(\.chatDisplay, ChatDisplay(preferences.current))
  }
}

extension View {
  func chatPreferences() -> some View {
    modifier(ChatPreferences())
  }
}
