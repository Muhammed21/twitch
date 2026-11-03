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
      .accessibilityIdentifier("player.surface")
  }
}

private struct PlayerStatus: View {
  @Environment(PlayerController.self) private var controller

  var body: some View {
    switch controller.state {
    case .idle, .playing:
      EmptyView()
    case .loading, .buffering:
      ProgressView().tint(.white)
    case .failed:
      VStack(spacing: LayoutRole.dialogTitleGap.points) {
        Text(PlayerText.failed)
          .font(TextRole.body.font)
          .foregroundStyle(.white)
        Button(PlayerText.retry) { controller.retry() }
          .buttonStyle(ActionButtonStyle(.secondary))
          .fixedSize()
      }
    case .ended:
      Text(PlayerText.ended)
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
  static var ended: String { String(localized: "player.ended", bundle: .module) }
}
