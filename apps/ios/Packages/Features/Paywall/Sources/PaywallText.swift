import Domain
import Foundation

public enum PaywallText {
  public static let title = LocalizedStringResource("paywall.title", bundle: .module)
  public static let headline = LocalizedStringResource("paywall.headline", bundle: .module)
  public static let tagline = LocalizedStringResource("paywall.tagline", bundle: .module)
  public static let perks = LocalizedStringResource("paywall.perks", bundle: .module)
  public static let restore = LocalizedStringResource("paywall.restore", bundle: .module)
  public static let close = LocalizedStringResource("paywall.close", bundle: .module)
  public static let subscribedTitle = LocalizedStringResource("paywall.subscribed.title", bundle: .module)
  public static let subscribedMessage = LocalizedStringResource("paywall.subscribed.message", bundle: .module)
  public static let unavailable = LocalizedStringResource("paywall.unavailable", bundle: .module)
  public static let later = LocalizedStringResource("paywall.later", bundle: .module)
  public static let badgePerk = LocalizedStringResource("paywall.perk.badge", bundle: .module)
  public static let badgePerkDetail = LocalizedStringResource("paywall.perk.badge.detail", bundle: .module)
  public static let colorPerk = LocalizedStringResource("paywall.perk.color", bundle: .module)
  public static let colorPerkDetail = LocalizedStringResource("paywall.perk.color.detail", bundle: .module)
  public static let choosePlan = LocalizedStringResource("paywall.plan.choose", bundle: .module)
  static let legalLead = LocalizedStringResource("paywall.legal.lead", bundle: .module)
  static let legalJoin = LocalizedStringResource("paywall.legal.join", bundle: .module)
  static let terms = LocalizedStringResource("paywall.legal.terms", bundle: .module)
  static let privacy = LocalizedStringResource("paywall.legal.privacy", bundle: .module)

  public static func subscribe(_ package: SubscriptionPackage) -> LocalizedStringResource {
    switch package.period {
    case .month: LocalizedStringResource("paywall.subscribe.month \(package.localizedPrice)", bundle: .module)
    case .year: LocalizedStringResource("paywall.subscribe.year \(package.localizedPrice)", bundle: .module)
    }
  }

  public static func billing(_ period: SubscriptionPeriod) -> LocalizedStringResource {
    switch period {
    case .month: LocalizedStringResource("paywall.billing.month", bundle: .module)
    case .year: LocalizedStringResource("paywall.billing.year", bundle: .module)
    }
  }

  public static func plan(_ period: SubscriptionPeriod) -> LocalizedStringResource {
    switch period {
    case .month: LocalizedStringResource("paywall.plan.month", bundle: .module)
    case .year: LocalizedStringResource("paywall.plan.year", bundle: .module)
    }
  }

  public static func savings(_ percent: Int) -> LocalizedStringResource {
    LocalizedStringResource("paywall.savings \(percent)", bundle: .module)
  }

  public static func perkState(isExpanded: Bool) -> LocalizedStringResource {
    isExpanded
      ? LocalizedStringResource("paywall.perk.expanded", bundle: .module)
      : LocalizedStringResource("paywall.perk.collapsed", bundle: .module)
  }

  public static func announcement(for notice: PaywallStore.Notice?) -> LocalizedStringResource? {
    notice.map(Self.notice)
  }

  public static func purchasing(_ isPurchasing: Bool) -> LocalizedStringResource? {
    isPurchasing ? LocalizedStringResource("paywall.subscribe.inProgress", bundle: .module) : nil
  }

  public static func notice(_ notice: PaywallStore.Notice) -> LocalizedStringResource {
    switch notice {
    case .purchaseFailed: LocalizedStringResource("paywall.notice.purchaseFailed", bundle: .module)
    case .nothingToRestore: LocalizedStringResource("paywall.notice.nothingToRestore", bundle: .module)
    case .restoreFailed: LocalizedStringResource("paywall.notice.restoreFailed", bundle: .module)
    }
  }

  public static func legal(terms termsURL: URL?, privacy privacyURL: URL?, locale: Locale = .current) -> AttributedString {
    AttributedString(text(legalLead, in: locale))
      + link(text(terms, in: locale), to: termsURL)
      + AttributedString(text(legalJoin, in: locale))
      + link(text(privacy, in: locale), to: privacyURL)
  }

  private static func text(_ resource: LocalizedStringResource, in locale: Locale) -> String {
    var localized = resource
    localized.locale = locale
    return String(localized: localized)
  }

  private static func link(_ text: String, to url: URL?) -> AttributedString {
    var linked = AttributedString(text)
    linked.link = url
    return linked
  }
}
