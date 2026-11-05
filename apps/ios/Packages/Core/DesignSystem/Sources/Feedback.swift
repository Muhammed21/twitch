import AudioToolbox
import SwiftUI

public enum FeedbackSound: String, CaseIterable, Sendable {
  case tap
  case validation
  case success
  case transition

  public static func bundled(_ sound: FeedbackSound) -> URL? {
    Bundle.module.url(forResource: sound.rawValue, withExtension: "wav", subdirectory: "Sounds")
  }
}

public struct FeedbackOutput: Equatable, Sendable {
  public let haptic: SensoryFeedback?
  public let sound: FeedbackSound?
}

public enum FeedbackRole: CaseIterable, Sendable {
  case selection
  case validation
  case success
  case pageChange
  case error

  public func output(reduceMotion: Bool) -> FeedbackOutput {
    FeedbackOutput(haptic: reduceMotion ? nil : haptic, sound: sound)
  }

  private var haptic: SensoryFeedback {
    switch self {
    case .selection: .selection
    case .validation: .impact(weight: .light)
    case .success: .success
    case .pageChange: .impact(flexibility: .soft)
    case .error: .error
    }
  }

  private var sound: FeedbackSound? {
    switch self {
    case .selection: .tap
    case .validation: .validation
    case .success: .success
    case .pageChange: .transition
    case .error: nil
    }
  }
}

@MainActor
public protocol SoundPlaying: AnyObject {
  func play(_ url: URL)
}

@MainActor
public final class SystemSoundPlayer: SoundPlaying {
  private var sounds: [URL: SystemSoundID] = [:]

  public init() {}

  public func play(_ url: URL) {
    guard let sound = sounds[url] ?? Self.register(url) else { return }
    sounds[url] = sound
    AudioServicesPlaySystemSound(sound)
  }

  private static func register(_ url: URL) -> SystemSoundID? {
    var sound: SystemSoundID = 0
    return AudioServicesCreateSystemSoundID(url as CFURL, &sound) == kAudioServicesNoError ? sound : nil
  }
}

@MainActor
public final class FeedbackPlayer {
  private let sounds: any SoundPlaying
  private let library: (FeedbackSound) -> URL?

  public init(
    sounds: any SoundPlaying = SystemSoundPlayer(),
    library: @escaping (FeedbackSound) -> URL? = FeedbackSound.bundled
  ) {
    self.sounds = sounds
    self.library = library
  }

  public func play(_ role: FeedbackRole) {
    guard let sound = role.output(reduceMotion: false).sound, let url = library(sound) else { return }
    sounds.play(url)
  }
}

public extension EnvironmentValues {
  @Entry var feedbackPlayer: FeedbackPlayer?
}

private struct FeedbackModifier<Trigger: Equatable>: ViewModifier {
  @Environment(\.feedbackPlayer) private var player
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let role: FeedbackRole
  let trigger: Trigger

  func body(content: Content) -> some View {
    content
      .sensoryFeedback(trigger: trigger) { _, _ in role.output(reduceMotion: reduceMotion).haptic }
      .onChange(of: trigger) { player?.play(role) }
  }
}

public extension View {
  func feedback(_ role: FeedbackRole, trigger: some Equatable) -> some View {
    modifier(FeedbackModifier(role: role, trigger: trigger))
  }
}
