import DesignTokens
import SwiftUI

public enum BrowseTabsStyle {
  public static let indicator = ColorRole.navigationActive

  public static func foreground(isSelected: Bool) -> ColorRole {
    isSelected ? .navigationActive : .textPrimary
  }

  public static func traits(isSelected: Bool) -> AccessibilityTraits {
    isSelected ? [.isButton, .isSelected] : .isButton
  }
}

public struct BrowseTabItem<Tab: Hashable>: Identifiable {
  public let tab: Tab
  public let title: String
  public let accessibilityIdentifier: String

  public var id: Tab { tab }

  public init(tab: Tab, title: String, accessibilityIdentifier: String) {
    self.tab = tab
    self.title = title
    self.accessibilityIdentifier = accessibilityIdentifier
  }
}

public struct BrowseTabs<Tab: Hashable>: View {
  @Binding private var selection: Tab
  private let items: [BrowseTabItem<Tab>]

  public init(selection: Binding<Tab>, items: [BrowseTabItem<Tab>]) {
    _selection = selection
    self.items = items
  }

  public var body: some View {
    HStack(alignment: .top, spacing: LayoutRole.browseTabGap.points) {
      ForEach(items) { item in
        let isSelected = item.tab == selection
        Button {
          selection = item.tab
        } label: {
          VStack(spacing: LayoutRole.browseTabIndicatorGap.points) {
            Text(item.title)
              .font(TextRole.display.font)
              .foregroundStyle(BrowseTabsStyle.foreground(isSelected: isSelected).color)
            Rectangle()
              .fill(BrowseTabsStyle.indicator.color)
              .frame(height: LayoutRole.browseTabIndicatorHeight.points)
              .opacity(isSelected ? 1 : 0)
          }
          .fixedSize()
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(item.accessibilityIdentifier)
        .accessibilityAddTraits(BrowseTabsStyle.traits(isSelected: isSelected))
        .id(item.tab)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

public struct ScrollingBrowseTabs<Tab: Hashable>: View {
  @Binding private var selection: Tab
  private let items: [BrowseTabItem<Tab>]

  public init(selection: Binding<Tab>, items: [BrowseTabItem<Tab>]) {
    _selection = selection
    self.items = items
  }

  public var body: some View {
    ScrollViewReader { proxy in
      ScrollView(.horizontal, showsIndicators: false) {
        BrowseTabs(selection: $selection, items: items)
          .padding(.horizontal, LayoutRole.screenInset.points)
      }
      .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
      .onChange(of: selection) { _, current in
        proxy.scrollTo(current, anchor: .center)
      }
    }
  }
}

public enum CategoryTileStyle {
  public static let coverAspectRatio = Spacing.x3 / Spacing.x4
  public static let coverPlaceholder = ColorRole.surfaceSecondary
  public static let liveDot = ColorRole.liveIndicator
  public static let viewers = ColorRole.textSecondary
}

public struct CategoryTile: View {
  private let name: String
  private let viewers: String?
  private let coverURL: URL?
  private let tag: String?

  public init(name: String, viewers: String?, coverURL: URL?, tag: String? = nil) {
    self.name = name
    self.viewers = viewers
    self.coverURL = coverURL
    self.tag = tag
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      cover
        .padding(.bottom, LayoutRole.categoryNameTop.points)
      Text(name)
        .font(TextRole.display.font)
        .foregroundStyle(ColorRole.textPrimary.color)
        .multilineTextAlignment(.leading)
      if let viewers {
        HStack(spacing: LayoutRole.categoryTileDotGap.points) {
          Circle()
            .fill(CategoryTileStyle.liveDot.color)
            .frame(width: LayoutRole.liveDotSize.points, height: LayoutRole.liveDotSize.points)
          Text(viewers)
            .font(TextRole.categoryViewers.font)
            .foregroundStyle(CategoryTileStyle.viewers.color)
        }
      }
      if let tag {
        CategoryTag(tag)
          .readableLineLimit(1)
          .padding(.top, LayoutRole.categoryTileTagTop.points)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }

  private var cover: some View {
    CategoryTileStyle.coverPlaceholder.color
      .aspectRatio(CategoryTileStyle.coverAspectRatio, contentMode: .fit)
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
