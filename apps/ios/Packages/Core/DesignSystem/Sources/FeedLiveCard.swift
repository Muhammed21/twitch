import SwiftUI

public enum FeedLiveCardStyle {
  public static let badgeBackground = ColorRole.scrim
  public static let badgeDot = ColorRole.liveIndicator
  public static let viewersBackground = ColorRole.scrim
  public static let overlayForeground = ColorRole.onMedia
  public static let name = ColorRole.textPrimary
  public static let title = ColorRole.textPrimary
  public static let titleLineLimit = 2
  public static let divider = ColorRole.surfaceSecondary
  public static let placeholder = ColorRole.surfaceSecondary
}

public struct FeedLiveCard: View {
  private let badge: String
  private let viewers: String?
  private let name: String
  private let title: String
  private let preview: LivePreview
  private let avatarURL: URL?

  public init(badge: String, viewers: String?, name: String, title: String, preview: LivePreview, avatarURL: URL?) {
    self.badge = badge
    self.viewers = viewers
    self.name = name
    self.title = title
    self.preview = preview
    self.avatarURL = avatarURL
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      thumbnail
      info
        .padding(.horizontal, LayoutRole.feedInfoInset.points)
        .padding(.top, LayoutRole.feedInfoTop.points)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var info: some View {
    VStack(alignment: .leading, spacing: LayoutRole.feedTitleTop.points) {
      HStack(spacing: LayoutRole.feedAvatarGap.points) {
        avatar
        Text(verbatim: name)
          .font(TextRole.feedChannelName.font)
          .foregroundStyle(FeedLiveCardStyle.name.color)
          .lineLimit(1)
      }
      Text(verbatim: title)
        .font(TextRole.feedTitle.font)
        .foregroundStyle(FeedLiveCardStyle.title.color)
        .lineLimit(FeedLiveCardStyle.titleLineLimit)
        .multilineTextAlignment(.leading)
    }
  }

  private var thumbnail: some View {
    Rectangle()
      .fill(FeedLiveCardStyle.placeholder.color)
      .aspectRatio(16 / 9, contentMode: .fit)
      .overlay { LivePreviewImage(preview: preview) }
      .clipped()
      .overlay(alignment: .topTrailing) { liveBadge }
      .overlay(alignment: .bottomLeading) { viewersLabel }
  }

  private var liveBadge: some View {
    HStack(spacing: LayoutRole.feedBadgeDotGap.points) {
      Circle()
        .fill(FeedLiveCardStyle.badgeDot.color)
        .frame(width: LayoutRole.liveDotSize.points, height: LayoutRole.liveDotSize.points)
      Text(verbatim: badge)
        .font(TextRole.feedOverlay.font)
        .foregroundStyle(FeedLiveCardStyle.overlayForeground.color)
    }
    .padding(.horizontal, LayoutRole.feedBadgePaddingH.points)
    .padding(.vertical, LayoutRole.feedOverlayPaddingV.points)
    .background(FeedLiveCardStyle.badgeBackground.color, in: Capsule())
    .padding(LayoutRole.feedBadgeInset.points)
  }

  @ViewBuilder private var viewersLabel: some View {
    if let viewers {
      Text(verbatim: viewers)
        .font(TextRole.feedOverlay.font)
        .foregroundStyle(FeedLiveCardStyle.overlayForeground.color)
        .padding(.horizontal, LayoutRole.feedViewersPaddingH.points)
        .padding(.vertical, LayoutRole.feedOverlayPaddingV.points)
        .background(
          FeedLiveCardStyle.viewersBackground.color,
          in: RoundedRectangle(cornerRadius: LayoutRole.feedViewersRadius.points)
        )
        .padding(LayoutRole.feedViewersInset.points)
    }
  }

  @ViewBuilder private var avatar: some View {
    if let avatarURL {
      AsyncImage(url: avatarURL) { image in
        image.resizable().scaledToFill()
          .frame(width: LayoutRole.feedAvatarSize.points, height: LayoutRole.feedAvatarSize.points)
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
    DefaultAvatar(diameter: LayoutRole.feedAvatarSize.points, glyphInset: LayoutRole.avatarGlyphInset.points)
  }
}

public struct FeedDivider: View {
  public init() {}

  public var body: some View {
    Capsule()
      .fill(FeedLiveCardStyle.divider.color)
      .frame(width: LayoutRole.feedDividerWidth.points, height: LayoutRole.feedDividerHeight.points)
      .frame(maxWidth: .infinity)
      .padding(.top, LayoutRole.feedDividerTop.points)
      .padding(.bottom, LayoutRole.feedDividerBottom.points)
      .accessibilityHidden(true)
  }
}

public enum FilterChipStyle {
  public static func background(isSelected: Bool) -> ColorRole {
    isSelected ? .chipSelected : .surfaceSecondary
  }

  public static func foreground(isSelected: Bool) -> ColorRole {
    isSelected ? .onChipSelected : .textPrimary
  }
}

public struct FilterChipItem<Value: Hashable>: Identifiable {
  public let value: Value
  public let title: String
  public let accessibilityIdentifier: String

  public var id: Value { value }

  public init(value: Value, title: String, accessibilityIdentifier: String) {
    self.value = value
    self.title = title
    self.accessibilityIdentifier = accessibilityIdentifier
  }
}

public struct FilterChips<Value: Hashable>: View {
  @Binding private var selection: Value
  private let items: [FilterChipItem<Value>]

  public init(selection: Binding<Value>, items: [FilterChipItem<Value>]) {
    _selection = selection
    self.items = items
  }

  public var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: LayoutRole.filterChipGap.points) {
        ForEach(items) { item in
          chip(item, isSelected: item.value == selection)
        }
      }
      .padding(.horizontal, LayoutRole.screenInset.points)
    }
  }

  private func chip(_ item: FilterChipItem<Value>, isSelected: Bool) -> some View {
    Button {
      selection = item.value
    } label: {
      Text(item.title)
        .font(TextRole.filterChip.font)
        .foregroundStyle(FilterChipStyle.foreground(isSelected: isSelected).color)
        .lineLimit(1)
        .padding(.horizontal, LayoutRole.filterChipPaddingH.points)
        .frame(minHeight: LayoutRole.filterChipHeight.points)
        .background(FilterChipStyle.background(isSelected: isSelected).color, in: Capsule())
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier(item.accessibilityIdentifier)
    .accessibilityAddTraits(isSelected ? .isSelected : [])
  }
}
