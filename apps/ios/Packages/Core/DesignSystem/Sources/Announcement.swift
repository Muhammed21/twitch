import SwiftUI

public enum Announcement {
  public static func spoken(from old: String?, to new: String?) -> String? {
    guard let new, new != old else { return nil }
    return new
  }
}

public extension View {
  func announcing(_ message: String?) -> some View {
    onChange(of: message) { old, new in
      if let spoken = Announcement.spoken(from: old, to: new) {
        AccessibilityNotification.Announcement(spoken).post()
      }
    }
  }

  func announcing(_ message: String?, each occurrence: some Equatable) -> some View {
    onChange(of: occurrence) {
      if let message {
        AccessibilityNotification.Announcement(message).post()
      }
    }
  }

  func accessibilityFocusOnAppear() -> some View {
    modifier(FocusOnAppear())
  }
}

private struct FocusOnAppear: ViewModifier {
  @AccessibilityFocusState private var isFocused: Bool

  func body(content: Content) -> some View {
    content
      .accessibilityFocused($isFocused)
      .onAppear { isFocused = true }
  }
}
