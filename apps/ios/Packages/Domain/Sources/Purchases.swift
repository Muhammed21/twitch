import Foundation

public enum SubscriptionPeriod: Equatable, Sendable {
  case month
  case year
}

public struct SubscriptionPackage: Equatable, Sendable {
  public let id: String
  public let offeringID: String
  public let period: SubscriptionPeriod
  public let localizedPrice: String

  public init(id: String, offeringID: String, period: SubscriptionPeriod, localizedPrice: String) {
    self.id = id
    self.offeringID = offeringID
    self.period = period
    self.localizedPrice = localizedPrice
  }
}

public struct SubscriptionOffering: Equatable, Sendable {
  public let id: String
  public let packages: [SubscriptionPackage]

  public init(id: String, packages: [SubscriptionPackage]) {
    self.id = id
    self.packages = packages
  }
}

public enum PurchaseOutcome: Equatable, Sendable {
  case subscribed
  case cancelled
}

public enum PurchasesFailure: Error, Equatable, Sendable {
  case unavailable
  case noOffering
  case failed(code: String)
}

@MainActor
public protocol Purchases: AnyObject {
  var isAvailable: Bool { get }
  func offering(_ id: String?) async throws(PurchasesFailure) -> SubscriptionOffering
  func purchase(_ package: SubscriptionPackage) async throws(PurchasesFailure) -> PurchaseOutcome
  func restore() async throws(PurchasesFailure) -> Bool
  func isTurboActive() async throws(PurchasesFailure) -> Bool
  func setAttribute(_ value: String, for key: String)
  func logIn(_ userID: UUID) async
  func logOut() async
}
