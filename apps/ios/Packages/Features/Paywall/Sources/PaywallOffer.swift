import Domain
import Foundation

public enum PaywallOffer {
  public static func preferred(in offering: SubscriptionOffering) -> SubscriptionPackage? {
    offering.packages.first { $0.period == .year } ?? offering.packages.first
  }

  public static func featured(in offering: SubscriptionOffering) -> SubscriptionPackage? {
    offering.packages.first { $0.period == .month } ?? offering.packages.first
  }

  public static func annualSavings(in offering: SubscriptionOffering) -> Int? {
    guard
      let monthly = offering.packages.first(where: { $0.period == .month })?.price,
      let annual = offering.packages.first(where: { $0.period == .year })?.price,
      monthly > 0
    else { return nil }
    let saved = (1 - annual / (monthly * 12)) * 100
    let percent = Int(NSDecimalNumber(decimal: saved).doubleValue.rounded(.down))
    return percent > 0 ? percent : nil
  }
}
