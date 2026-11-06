import Chat
import Domain
import Preferences
import SwiftUI
import Testing
@testable import Twitch
import UIKit

@MainActor
private final class Seen {
  private(set) var display: ChatDisplay?

  func record(_ display: ChatDisplay) {
    self.display = display
  }
}

private struct Probe: View {
  let seen: Seen
  @Environment(\.chatDisplay) private var display

  var body: some View {
    Color.clear.onAppear { seen.record(display) }
  }
}

@MainActor
private func settle() async {
  for _ in 0 ..< 10 {
    try? await Task.sleep(for: .milliseconds(20))
  }
}

@MainActor
private func host(_ view: some View) -> UIWindow {
  let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
  window.rootViewController = UIHostingController(rootView: view)
  window.makeKeyAndVisible()
  return window
}

@MainActor
@Suite("Réglages du chat : la page de chaîne et le widget du gestionnaire de stream les suivent")
struct ChatPreferencesTests {
  @Test("le chat sous .chatPreferences() prend la taille de texte et l'horodatage choisis")
  func followsUserSettings() async {
    let preferences = PreferencesStore(repository: InMemoryPreferences(language: .english), onChange: { _ in })
    preferences.update(.chatTextSize(.large), source: .settings)
    preferences.update(.chatTimestamps(true), source: .settings)
    let seen = Seen()

    let window = host(Probe(seen: seen).chatPreferences().environment(preferences))
    await settle()

    #expect(seen.display == ChatDisplay(textSize: .large, showsTimestamps: true))
    window.isHidden = true
  }
}
