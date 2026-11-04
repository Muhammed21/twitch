import SwiftUI

public enum ProfileText {
  static let myChannel = LocalizedStringResource("profile.myChannel", bundle: .module)
  static let streamManager = LocalizedStringResource("profile.streamManager", bundle: .module)
  static let settings = LocalizedStringResource("profile.settings", bundle: .module)
  static let noChannel = LocalizedStringResource("profile.noChannel", bundle: .module)
  static let failed = LocalizedStringResource("profile.failed", bundle: .module)
  static let retry = LocalizedStringResource("profile.retry", bundle: .module)
  static let title = LocalizedStringResource("streamManager.title", bundle: .module)
  static let edit = LocalizedStringResource("streamManager.edit", bundle: .module)
  static let streamKey = LocalizedStringResource("streamManager.streamKey", bundle: .module)
  static let server = LocalizedStringResource("streamManager.server", bundle: .module)
  static let show = LocalizedStringResource("streamManager.show", bundle: .module)
  static let hide = LocalizedStringResource("streamManager.hide", bundle: .module)
  static let copy = LocalizedStringResource("streamManager.copy", bundle: .module)
  static let editStreamInfo = LocalizedStringResource("editStreamInfo.navigationTitle", bundle: .module)
  static let cancel = LocalizedStringResource("editStreamInfo.cancel", bundle: .module)
  static let done = LocalizedStringResource("editStreamInfo.done", bundle: .module)
  static let close = LocalizedStringResource("streamManager.close", bundle: .module)
  public static var streamManagerTitle: String { String(localized: "profile.streamManager", bundle: .module) }
  public static var tabTitle: String { String(localized: "profile.tab", bundle: .module) }
  static let masked = "••••••••••••••••"

  public static func lastLive(at date: Date, now: Date, locale: Locale) -> String {
    let seconds = max(0, now.timeIntervalSince(date))
    let units: Set<Duration.UnitsFormatStyle.Unit> = seconds < 60 ? [.minutes] : [.days, .hours, .minutes]
    let short = Duration.seconds(seconds).formatted(
      .units(allowed: units, width: .narrow, maximumUnitCount: 1, zeroValueUnits: .show(length: 1), fractionalPart: .hide(rounded: .down))
        .locale(locale)
    )
    return String(format: String(localized: "profile.lastLive", bundle: .module, locale: locale), short)
  }

  static func remaining(_ count: Int) -> LocalizedStringResource {
    LocalizedStringResource("editStreamInfo.remaining \(count)", bundle: .module)
  }

  public static let resetKey = LocalizedStringResource("streamManager.resetKey", bundle: .module)
  public static let resetKeyTitle = LocalizedStringResource("streamManager.resetKey.title", bundle: .module)
  public static let resetKeyMessage = LocalizedStringResource("streamManager.resetKey.message", bundle: .module)

  public static func notice(_ notice: MyChannelStore.Notice) -> LocalizedStringResource {
    switch notice {
    case .keyCopied: LocalizedStringResource("streamManager.notice.keyCopied", bundle: .module)
    case .keyUnavailable: LocalizedStringResource("streamManager.notice.keyUnavailable", bundle: .module)
    case .titleSaved: LocalizedStringResource("streamManager.notice.titleSaved", bundle: .module)
    case .titleFailed: LocalizedStringResource("streamManager.notice.titleFailed", bundle: .module)
    case .keyRotated: LocalizedStringResource("streamManager.notice.keyRotated", bundle: .module)
    case .keyRotationFailed: LocalizedStringResource("streamManager.notice.keyRotationFailed", bundle: .module)
    }
  }

  public static let obsSettings: [(label: LocalizedStringResource, value: LocalizedStringResource)] = [
    (LocalizedStringResource("obs.videoEncoder", bundle: .module), LocalizedStringResource("obs.videoEncoder.value", bundle: .module)),
    (LocalizedStringResource("obs.audioEncoder", bundle: .module), LocalizedStringResource("obs.audioEncoder.value", bundle: .module)),
    (LocalizedStringResource("obs.keyframeInterval", bundle: .module), LocalizedStringResource("obs.keyframeInterval.value", bundle: .module)),
    (LocalizedStringResource("obs.maxBitrate", bundle: .module), LocalizedStringResource("obs.maxBitrate.value", bundle: .module)),
  ]
}
