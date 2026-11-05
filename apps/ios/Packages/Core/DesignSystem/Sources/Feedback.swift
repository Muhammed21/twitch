import AVFoundation
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
public protocol AudioSessionSetting: AnyObject {
  func setCategory(_ category: AVAudioSession.Category, options: AVAudioSession.CategoryOptions) throws
  func setActive(_ active: Bool) throws
}

extension AVAudioSession: AudioSessionSetting {
  public func setActive(_ active: Bool) throws {
    try setActive(active, options: [])
  }
}

@MainActor
public protocol SoundPlaying: AnyObject {
  func play(_ url: URL)
}

@MainActor
public final class SystemSoundPlayer: SoundPlaying {
  private var players: [URL: AVAudioPlayer] = [:]

  public init() {}

  public func play(_ url: URL) {
    guard let player = players[url] ?? (try? AVAudioPlayer(contentsOf: url)) else { return }
    players[url] = player
    player.currentTime = 0
    player.play()
  }
}

@MainActor
public final class FeedbackPlayer {
  private let session: any AudioSessionSetting
  private let sounds: any SoundPlaying
  private let library: (FeedbackSound) -> URL?
  private var isReady = false

  public init(
    session: any AudioSessionSetting = AVAudioSession.sharedInstance(),
    sounds: any SoundPlaying = SystemSoundPlayer(),
    library: @escaping (FeedbackSound) -> URL? = FeedbackSound.bundled
  ) {
    self.session = session
    self.sounds = sounds
    self.library = library
  }

  public func play(_ role: FeedbackRole) {
    guard let sound = role.output(reduceMotion: false).sound, let url = library(sound), prepare() else { return }
    sounds.play(url)
  }

  private func prepare() -> Bool {
    guard !isReady else { return true }
    do {
      try session.setCategory(.ambient, options: .mixWithOthers)
      try session.setActive(true)
      isReady = true
    } catch {
      isReady = false
    }
    return isReady
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
