import SwiftUI

public enum ProfileText {
  static let myChannel = LocalizedStringResource("profile.myChannel", bundle: .module)
  static let streamManager = LocalizedStringResource("profile.streamManager", bundle: .module)
  static let settings = LocalizedStringResource("profile.settings", bundle: .module)
  static let noChannel = LocalizedStringResource("profile.noChannel", bundle: .module)
  static let failed = LocalizedStringResource("profile.failed", bundle: .module)
  static let retry = LocalizedStringResource("profile.retry", bundle: .module)
  static let title = LocalizedStringResource("streamManager.title", bundle: .module)
  static let streamKey = LocalizedStringResource("streamManager.streamKey", bundle: .module)
  static let server = LocalizedStringResource("streamManager.server", bundle: .module)
  static let show = LocalizedStringResource("streamManager.show", bundle: .module)
  static let hide = LocalizedStringResource("streamManager.hide", bundle: .module)
  static let copy = LocalizedStringResource("streamManager.copy", bundle: .module)
  static let obs = LocalizedStringResource("streamManager.obs", bundle: .module)
  static let masked = "••••••••••••••••"

  public static func notice(_ notice: MyChannelStore.Notice) -> LocalizedStringResource {
    switch notice {
    case .keyCopied: LocalizedStringResource("streamManager.notice.keyCopied", bundle: .module)
    case .keyUnavailable: LocalizedStringResource("streamManager.notice.keyUnavailable", bundle: .module)
    }
  }

  public static let obsSettings: [(label: LocalizedStringResource, value: LocalizedStringResource)] = [
    (LocalizedStringResource("obs.videoEncoder", bundle: .module), LocalizedStringResource("obs.videoEncoder.value", bundle: .module)),
    (LocalizedStringResource("obs.audioEncoder", bundle: .module), LocalizedStringResource("obs.audioEncoder.value", bundle: .module)),
    (LocalizedStringResource("obs.keyframeInterval", bundle: .module), LocalizedStringResource("obs.keyframeInterval.value", bundle: .module)),
    (LocalizedStringResource("obs.maxBitrate", bundle: .module), LocalizedStringResource("obs.maxBitrate.value", bundle: .module)),
  ]
}
