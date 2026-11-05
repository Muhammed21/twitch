import Domain
import Preferences
import SwiftUI

@MainActor
public struct SettingChoices {
  private let preferences: PreferencesStore

  public init(preferences: PreferencesStore) {
    self.preferences = preferences
  }

  public var matchesSystem: Bool {
    preferences.current.appearance == .system
  }

  public var isDark: Bool {
    preferences.current.appearance == .dark
  }

  public var autoplay: VideoAutoplay {
    preferences.current.videoAutoplay
  }

  public var chatTextSize: ChatTextSize {
    preferences.current.chatTextSize
  }

  public var showsTimestamps: Bool {
    preferences.current.showsChatTimestamps
  }

  public func matchSystem(_ isMatching: Bool, isShowingDark: Bool) {
    let appearance: Appearance = isMatching ? .system : isShowingDark ? .dark : .light
    preferences.update(.appearance(appearance), source: .onboarding)
  }

  public func dark(_ isDark: Bool) {
    preferences.update(.appearance(isDark ? .dark : .light), source: .onboarding)
  }

  public func choose(_ autoplay: VideoAutoplay) {
    preferences.update(.videoAutoplay(autoplay), source: .onboarding)
  }

  public func choose(_ size: ChatTextSize) {
    preferences.update(.chatTextSize(size), source: .onboarding)
  }

  public func showTimestamps(_ isShowing: Bool) {
    preferences.update(.chatTimestamps(isShowing), source: .onboarding)
  }
}

public extension Appearance {
  var colorScheme: ColorScheme? {
    switch self {
    case .system: nil
    case .dark: .dark
    case .light: .light
    }
  }
}
