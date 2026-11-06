import Foundation

public enum PaywallPerk: CaseIterable, Hashable, Sendable {
  case badge
  case color

  public var title: LocalizedStringResource {
    switch self {
    case .badge: PaywallText.badgePerk
    case .color: PaywallText.colorPerk
    }
  }

  public var detail: LocalizedStringResource {
    switch self {
    case .badge: LocalizedStringResource("paywall.perk.badge.description", bundle: .module)
    case .color: LocalizedStringResource("paywall.perk.color.description", bundle: .module)
    }
  }
}

public struct PaywallPerkExpansion: Equatable, Sendable {
  private let expanded: Set<PaywallPerk>

  public init() {
    expanded = []
  }

  private init(expanded: Set<PaywallPerk>) {
    self.expanded = expanded
  }

  public func isExpanded(_ perk: PaywallPerk) -> Bool {
    expanded.contains(perk)
  }

  public func toggling(_ perk: PaywallPerk) -> Self {
    Self(expanded: isExpanded(perk) ? expanded.subtracting([perk]) : expanded.union([perk]))
  }

  public func titleLineLimit(for perk: PaywallPerk) -> Int? {
    isExpanded(perk) ? nil : 1
  }

  public func detailLineLimit(for perk: PaywallPerk) -> Int? {
    isExpanded(perk) ? nil : 2
  }
}
