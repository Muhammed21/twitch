import Domain
import Foundation
@preconcurrency import RevenueCat

@MainActor
final class RevenueCatBackend: PurchasesBackend {
  private let sdk: RevenueCat.Purchases
  private var packages: [String: [String: Package]] = [:]

  init(configuration: PurchasesConfiguration) {
    sdk = RevenueCat.Purchases.configure(withAPIKey: configuration.apiKey)
  }

  func offerings() async throws(PurchasesBackendError) -> StoreOfferings {
    let offerings = try await call { try await self.sdk.offerings() }
    packages = offerings.all.mapValues { offering in
      Dictionary(offering.availablePackages.map { ($0.identifier, $0) }, uniquingKeysWith: { first, _ in first })
    }
    return StoreOfferings(current: offerings.current?.identifier, all: offerings.all.mapValues(Self.offering))
  }

  func purchase(_ package: SubscriptionPackage) async throws(PurchasesBackendError) -> StorePurchaseResult {
    guard let storePackage = packages[package.offeringID]?[package.id] else { throw .failed(code: "package_unknown") }
    let result = try await call { try await self.sdk.purchase(package: storePackage) }
    return StorePurchaseResult(cancelled: result.userCancelled, entitlements: Self.active(result.customerInfo))
  }

  func restore() async throws(PurchasesBackendError) -> Set<String> {
    try await Self.active(call { try await self.sdk.restorePurchases() })
  }

  func activeEntitlements() async throws(PurchasesBackendError) -> Set<String> {
    try await Self.active(call { try await self.sdk.customerInfo() })
  }

  func setAttributes(_ attributes: [String: String]) {
    sdk.attribution.setAttributes(attributes)
  }

  func logIn(_ appUserID: String) async throws(PurchasesBackendError) {
    _ = try await call { try await self.sdk.logIn(appUserID) }
  }

  func logOut() async throws(PurchasesBackendError) {
    guard !sdk.isAnonymous else { return }
    _ = try await call { try await self.sdk.logOut() }
  }

  private func call<Value>(_ operation: () async throws -> Value) async throws(PurchasesBackendError) -> Value {
    do {
      return try await operation()
    } catch let error as ErrorCode {
      throw .failed(code: String(describing: error))
    } catch {
      throw .failed(code: "unknown")
    }
  }

  private static func active(_ info: CustomerInfo) -> Set<String> {
    Set(info.entitlements.active.keys)
  }

  private static func offering(_ offering: Offering) -> SubscriptionOffering {
    SubscriptionOffering(
      id: offering.identifier,
      packages: offering.availablePackages.compactMap { package in
        period(package.packageType).map {
          SubscriptionPackage(
            id: package.identifier,
            offeringID: offering.identifier,
            period: $0,
            localizedPrice: package.storeProduct.localizedPriceString
          )
        }
      }
    )
  }

  private static func period(_ type: PackageType) -> Domain.SubscriptionPeriod? {
    switch type {
    case .monthly: .month
    case .annual: .year
    default: nil
    }
  }
}

public extension StorePurchases {
  static func live(info: [String: Any]) -> StorePurchases {
    StorePurchases(backend: PurchasesConfiguration(info: info).map(RevenueCatBackend.init))
  }
}
