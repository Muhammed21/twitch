import AVFoundation
import DesignSystem
import SwiftUI
import UIKit

public struct PlayerSurface: View {
  @Environment(PlayerController.self) private var controller

  public init() {}

  public var body: some View {
    PlayerLayer(controller: controller)
      .aspectRatio(16 / 9, contentMode: .fit)
      .background(Color.black)
      .overlay { PlayerStatus() }
      .accessibilityElement(children: .contain)
      .accessibilityIdentifier("player.surface")
  }
}

private struct PlayerStatus: View {
  @Environment(PlayerController.self) private var controller

  var body: some View {
    if let status = PlayerText.status(of: controller.state) {
      PlayerStatusContent(state: controller.state, status: status)
    }
  }
}

private struct PlayerStatusContent: View {
  @Environment(PlayerController.self) private var controller
  let state: PlayerState
  let status: String

  var body: some View {
    switch state {
    case .idle:
      EmptyView()
    case .playing:
      Color.clear
        .allowsHitTesting(false)
        .accessibilityElement()
        .accessibilityLabel(status)
        .accessibilityIdentifier("player.playing")
    case .loading, .buffering:
      ProgressView().tint(.white)
        .accessibilityLabel(status)
    case .failed:
      VStack(spacing: LayoutRole.dialogTitleGap.points) {
        Text(status)
          .font(TextRole.body.font)
          .foregroundStyle(.white)
          .multilineTextAlignment(.center)
        Button(PlayerText.retry) { controller.retry() }
          .buttonStyle(ActionButtonStyle(.secondary))
          .fixedSize()
      }
    case .paused:
      Button { controller.resume() } label: {
        Image(systemName: "play.fill")
          .font(.largeTitle)
          .foregroundStyle(.white)
      }
      .accessibilityLabel(PlayerText.play)
      .accessibilityValue(status)
    case .ended:
      Text(status)
        .font(TextRole.body.font)
        .foregroundStyle(.white)
    }
  }
}

private struct PlayerLayer: UIViewRepresentable {
  let controller: PlayerController

  func makeUIView(context _: Context) -> PlayerLayerView {
    let view = PlayerLayerView()
    if let layer = view.layer as? AVPlayerLayer {
      controller.render(into: layer)
    }
    return view
  }

  func updateUIView(_: PlayerLayerView, context _: Context) {}
}

final class PlayerLayerView: UIView {
  override static var layerClass: AnyClass { AVPlayerLayer.self }
}

enum PlayerText {
  static var failed: String { String(localized: "player.failed", bundle: .module) }
  static var retry: String { String(localized: "player.retry", bundle: .module) }
  static var playing: String { String(localized: "player.playing", bundle: .module) }
  static var play: String { String(localized: "player.play", bundle: .module) }
  static var ended: String { String(localized: "player.ended", bundle: .module) }
  static var paused: String { String(localized: "player.paused", bundle: .module) }
  static var loading: String { String(localized: "player.loading", bundle: .module) }

  static func status(of state: PlayerState) -> String? {
    switch state {
    case .idle: nil
    case .loading, .buffering: loading
    case .playing: playing
    case .paused: paused
    case .failed: failed
    case .ended: ended
    }
  }
}
