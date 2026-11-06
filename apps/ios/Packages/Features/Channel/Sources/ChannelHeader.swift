import DesignSystem
import Domain
import Foundation
import SwiftUI

struct HeaderLine: Equatable {
  let isLive: Bool
  let viewers: HeaderViewers?
}

struct HeaderViewers: Equatable {
  let shown: String
  let count: Int
}

extension HeaderLine {
  init(status: LiveStatus?, locale: Locale) {
    guard case let .live(count, _, _) = status else {
      self.init(isLive: false, viewers: nil)
      return
    }
    self.init(
      isLive: true,
      viewers: count.map {
        HeaderViewers(shown: $0.value.formatted(.number.notation(.compactName).locale(locale)), count: $0.value)
      }
    )
  }
}

public struct ChannelHeader: View {
  @Environment(LiveStatusChannel.self) private var channel
  @Environment(\.locale) private var locale

  public init() {}

  public var body: some View {
    let line = HeaderLine(status: channel.status, locale: locale)
    HStack(spacing: LayoutRole.dialogActionGap.points) {
      Text(ChannelText.title(channel.title, channelNotFound: channel.channelNotFound))
        .font(TextRole.dialogTitle.font)
        .foregroundStyle(ColorRole.textPrimary.color)
        .accessibilityAddTraits(.isHeader)
      if line.isLive {
        Text(ChannelText.live)
          .font(TextRole.actionLabel.font)
          .foregroundStyle(ColorRole.onDanger.color)
          .padding(.horizontal, LayoutRole.dialogActionGap.points)
          .background(ColorRole.danger.color, in: .capsule)
          .accessibilityLabel(ChannelText.liveSpoken)
          .accessibilityIdentifier("channel.live")
      }
      Spacer(minLength: 0)
      if let viewers = line.viewers {
        Label(viewers.shown, systemImage: "person")
          .font(TextRole.body.font)
          .foregroundStyle(ColorRole.textSecondary.color)
          .accessibilityLabel(ChannelText.viewers(viewers.count, shown: viewers.shown))
          .accessibilityIdentifier("channel.viewers")
      }
    }
    .padding(LayoutRole.screenInset.points)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("channel.header")
  }
}

enum ChannelText {
  static var live: String { String(localized: "channel.live", bundle: .module) }
  static var liveSpoken: String { String(localized: "channel.live.spoken", bundle: .module) }

  static func title(_ title: String?, channelNotFound: Bool) -> String {
    channelNotFound ? String(localized: "channel.notFound", bundle: .module) : title ?? ""
  }

  static func viewers(_ count: Int, shown: String) -> String {
    String(localized: "channel.viewers \(count) \(shown)", bundle: .module)
  }
}
