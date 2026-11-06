import SwiftUI

public enum LiveCardStyle {
  public static let badgeBackground = ColorRole.liveBadge
  public static let badgeForeground = ColorRole.onLiveBadge
  public static let viewersBackground = ColorRole.scrim
  public static let viewersForeground = ColorRole.onMedia
  public static let name = ColorRole.textPrimary
  public static let detail = ColorRole.textSecondary
  public static let placeholder = ColorRole.surfaceSecondary
}

public struct LivePreview: Hashable, Sendable {
  public let url: URL?
  public let generation: Int

  public init(url: URL?, generation: Int) {
    self.url = url
    self.generation = generation
  }

  public var request: URLRequest? {
    url.map { URLRequest(url: $0, cachePolicy: .reloadIgnoringLocalCacheData) }
  }
}

public struct LiveCard: View {
  private let badge: String
  private let viewers: String?
  private let name: String
  private let title: String
  private let category: String?
  private let preview: LivePreview
  private let avatarURL: URL?

  public init(
    badge: String,
    viewers: String?,
    name: String,
    title: String,
    category: String?,
    preview: LivePreview,
    avatarURL: URL? = nil
  ) {
    self.badge = badge
    self.viewers = viewers
    self.name = name
    self.title = title
    self.category = category
    self.preview = preview
    self.avatarURL = avatarURL
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      thumbnail
      HStack(alignment: .top, spacing: LayoutRole.cardAvatarGap.points) {
        avatar
        info
      }
      .padding(.horizontal, LayoutRole.cardInset.points)
      .padding(.top, LayoutRole.cardInfoTop.points)
      .padding(.bottom, LayoutRole.cardInfoBottom.points)
    }
  }

  @ViewBuilder private var avatar: some View {
    if let avatarURL {
      AsyncImage(url: avatarURL) { image in
        image.resizable().scaledToFill()
          .frame(width: LayoutRole.cardAvatarSize.points, height: LayoutRole.cardAvatarSize.points)
          .clipShape(Circle())
          .accessibilityHidden(true)
      } placeholder: {
        defaultAvatar
      }
    } else {
      defaultAvatar
    }
  }

  private var defaultAvatar: some View {
    DefaultAvatar(diameter: LayoutRole.cardAvatarSize.points, glyphInset: LayoutRole.cardAvatarGlyphInset.points)
  }

  private var thumbnail: some View {
    Rectangle()
      .fill(LiveCardStyle.placeholder.color)
      .aspectRatio(16 / 9, contentMode: .fit)
      .overlay { LivePreviewImage(preview: preview) }
      .clipped()
      .overlay(alignment: .topLeading) {
        MediaLabel(text: badge, font: .liveBadge, foreground: LiveCardStyle.badgeForeground, background: LiveCardStyle.badgeBackground)
      }
      .overlay(alignment: .bottomLeading) {
        if let viewers {
          MediaLabel(text: viewers, font: .viewerCount, foreground: LiveCardStyle.viewersForeground, background: LiveCardStyle.viewersBackground)
        }
      }
  }

  private var info: some View {
    VStack(alignment: .leading, spacing: LayoutRole.cardLineGap.points) {
      Text(verbatim: name)
        .font(TextRole.channelName.font)
        .foregroundStyle(LiveCardStyle.name.color)
      Text(verbatim: title)
        .font(TextRole.cardDetail.font)
        .foregroundStyle(LiveCardStyle.detail.color)
      if let category {
        Text(verbatim: category)
          .font(TextRole.cardDetail.font)
          .foregroundStyle(LiveCardStyle.detail.color)
      }
    }
    .readableLineLimit(1)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct MediaLabel: View {
  let text: String
  let font: TextRole
  let foreground: ColorRole
  let background: ColorRole

  var body: some View {
    Text(verbatim: text)
      .font(font.font)
      .foregroundStyle(foreground.color)
      .padding(.horizontal, LayoutRole.liveBadgePadding.points)
      .frame(minHeight: LayoutRole.liveBadgeHeight.points)
      .background(background.color, in: RoundedRectangle(cornerRadius: LayoutRole.liveBadgeRadius.points))
      .padding(LayoutRole.mediaInset.points)
  }
}
