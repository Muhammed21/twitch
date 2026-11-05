import SwiftUI

public enum CategoryTagStyle {
  public static let foreground = ColorRole.textSecondary
  public static let background = ColorRole.surfaceSecondary
}

public enum CategoryHeaderStyle {
  public static let name = TextRole.title
  public static let viewers = TextRole.meta
  public static let coverAspectRatio = CategoryTileStyle.coverAspectRatio
}

public enum CategoryFollowStyle {
  public static let followers = ColorRole.textPrimary

  public static func kind(isFollowing: Bool) -> ActionButtonKind {
    isFollowing ? .secondary : .primary
  }

  public static func glyph(isFollowing: Bool) -> String {
    isFollowing ? "heart.fill" : "heart"
  }
}

public struct CategoryFollowAction {
  public let isFollowing: Bool
  public let label: String
  public let isEnabled: Bool
  public let action: () -> Void

  public init(isFollowing: Bool, label: String, isEnabled: Bool, action: @escaping () -> Void) {
    self.isFollowing = isFollowing
    self.label = label
    self.isEnabled = isEnabled
    self.action = action
  }
}

struct CategoryFollowButton: View {
  let follow: CategoryFollowAction

  var body: some View {
    let kind = CategoryFollowStyle.kind(isFollowing: follow.isFollowing)
    Button(action: follow.action) {
      Label {
        if !follow.isFollowing { Text(follow.label) }
      } icon: {
        Image(systemName: CategoryFollowStyle.glyph(isFollowing: follow.isFollowing))
      }
      .font(TextRole.actionLabel.font)
      .foregroundStyle(kind.foreground.color)
      .frame(maxWidth: .infinity, minHeight: LayoutRole.followButtonHeight.points)
      .background(kind.background.color, in: RoundedRectangle(cornerRadius: LayoutRole.actionRadius.points))
    }
    .buttonStyle(.plain)
    .disabled(!follow.isEnabled)
    .accessibilityLabel(follow.label)
    .accessibilityAddTraits(follow.isFollowing ? .isSelected : [])
    .accessibilityIdentifier("category.follow")
  }
}

public struct CategoryTag: View {
  private let label: String

  public init(_ label: String) {
    self.label = label
  }

  public var body: some View {
    Text(label)
      .font(TextRole.tag.font)
      .foregroundStyle(CategoryTagStyle.foreground.color)
      .padding(.horizontal, LayoutRole.categoryTagPaddingH.points)
      .padding(.vertical, LayoutRole.categoryTagPaddingV.points)
      .background(CategoryTagStyle.background.color, in: Capsule())
  }
}

public struct CategoryHeader: View {
  private let name: String
  private let viewers: String?
  private let coverURL: URL?
  private let tags: [String]
  private let followers: AttributedString?
  private let follow: CategoryFollowAction?

  public init(
    name: String,
    viewers: String?,
    coverURL: URL?,
    tags: [String],
    followers: AttributedString? = nil,
    follow: CategoryFollowAction? = nil
  ) {
    self.name = name
    self.viewers = viewers
    self.coverURL = coverURL
    self.tags = tags
    self.followers = followers
    self.follow = follow
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: LayoutRole.categoryHeaderGap.points) {
      summary
      if let follow {
        HStack(spacing: LayoutRole.followButtonColumnGap.points) {
          CategoryFollowButton(follow: follow)
          Color.clear.frame(maxWidth: .infinity, maxHeight: 0)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var summary: some View {
    HStack(alignment: .top, spacing: LayoutRole.categoryHeaderGap.points) {
      cover
      VStack(alignment: .leading, spacing: LayoutRole.categoryHeaderLineGap.points) {
        Text(name)
          .font(CategoryHeaderStyle.name.font)
          .foregroundStyle(ColorRole.textPrimary.color)
          .accessibilityAddTraits(.isHeader)
        if let viewers {
          HStack(spacing: LayoutRole.liveDotGap.points) {
            Circle()
              .fill(CategoryTileStyle.liveDot.color)
              .frame(width: LayoutRole.liveDotSize.points, height: LayoutRole.liveDotSize.points)
            Text(viewers)
              .font(CategoryHeaderStyle.viewers.font)
              .foregroundStyle(CategoryTileStyle.viewers.color)
          }
        }
        if let followers {
          Text(followers)
            .font(TextRole.followerCount.font)
            .foregroundStyle(CategoryFollowStyle.followers.color)
            .accessibilityIdentifier("category.followers")
        }
        if !tags.isEmpty {
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: LayoutRole.categoryTagGap.points) {
              ForEach(tags, id: \.self) { CategoryTag($0) }
            }
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var cover: some View {
    CategoryTileStyle.coverPlaceholder.color
      .aspectRatio(CategoryHeaderStyle.coverAspectRatio, contentMode: .fit)
      .frame(width: LayoutRole.categoryHeaderCoverWidth.points)
      .overlay {
        if let coverURL {
          AsyncImage(url: coverURL) { image in
            image.resizable().scaledToFill()
          } placeholder: {
            CategoryTileStyle.coverPlaceholder.color
          }
        }
      }
      .clipped()
      .accessibilityHidden(true)
  }
}
