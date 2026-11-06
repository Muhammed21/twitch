import DesignSystem
import Domain

public enum HomeFilter: Hashable, Sendable {
  case all
  case category(CategorySlug)

  public static let initial = HomeFilter.all

  public var category: CategorySlug? {
    switch self {
    case .all: nil
    case let .category(slug): slug
    }
  }

  public static func chips(for categories: [BrowseCategory]) -> [FilterChipItem<HomeFilter>] {
    [FilterChipItem(value: .all, title: HomeText.allFilter, accessibilityIdentifier: "home.filter.all")]
      + categories.map {
        FilterChipItem(
          value: .category($0.slug),
          title: $0.name,
          accessibilityIdentifier: "home.filter.\($0.slug.rawValue)"
        )
      }
  }
}
