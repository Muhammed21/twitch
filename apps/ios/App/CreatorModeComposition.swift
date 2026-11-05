import Dashboard
import Foundation
import Navigation
import SwiftUI

struct DefaultsModeStorage: AppModeStorage {
  static let key = "creatorMode.mode"

  let defaults: UserDefaults

  func load() -> AppMode? {
    defaults.string(forKey: Self.key).flatMap(AppMode.init(rawValue:))
  }

  func save(_ mode: AppMode) {
    defaults.set(mode.rawValue, forKey: Self.key)
  }
}

extension Composition {
  static let modeTransitionHold = Duration.seconds(1)

  static func creatorMode(defaults: UserDefaults) -> CreatorMode {
    CreatorMode(storage: DefaultsModeStorage(defaults: defaults), hold: modeTransitionHold)
  }
}

@MainActor
enum DeepLinkOpening {
  static func open(_ url: URL, router: Router, creatorMode: CreatorMode) {
    guard router.open(url) else { return }
    creatorMode.reset()
  }
}

struct CreatorModePresentation: ViewModifier {
  @Environment(CreatorMode.self) private var creatorMode
  let onStream: () -> Void

  func body(content: Content) -> some View {
    @Bindable var creatorMode = creatorMode
    content
      .sheet(isPresented: $creatorMode.isShowingActions) {
        CreateActionsSheet(onStream: onStream)
      }
      .overlay {
        if let target = creatorMode.transition {
          ModeTransition(to: target)
        }
      }
  }
}

extension View {
  func creatorModePresentation(onStream: @escaping () -> Void) -> some View {
    modifier(CreatorModePresentation(onStream: onStream))
  }
}
