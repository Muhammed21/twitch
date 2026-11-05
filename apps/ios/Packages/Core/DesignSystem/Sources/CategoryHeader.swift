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

  public init(name: String, viewers: String?, coverURL: URL?, tags: [String]) {
    self.name = name
    self.viewers = viewers
    self.coverURL = coverURL
    self.tags = tags
  }

  public var body: some View {
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
