import Domain
import Foundation

public struct StoreOfferings: Equatable, Sendable {
  public let current: String?
  public let all: [String: SubscriptionOffering]

  public init(current: String?, all: [String: SubscriptionOffering]) {
    self.current = current
    self.all = all
  }
}

public struct StorePurchaseResult: Equatable, Sendable {
  public let cancelled: Bool
  public let entitlements: Set<String>

  public init(cancelled: Bool, entitlements: Set<String>) {
    self.cancelled = cancelled
    self.entitlements = entitlements
  }
}

public enum PurchasesBackendError: Error, Equatable, Sendable {
  case failed(code: String)
}

@MainActor
public protocol PurchasesBackend: AnyObject {
  func offerings() async throws(PurchasesBackendError) -> StoreOfferings
  func purchase(_ package: SubscriptionPackage) async throws(PurchasesBackendError) -> StorePurchaseResult
  func restore() async throws(PurchasesBackendError) -> Set<String>
  func activeEntitlements() async throws(PurchasesBackendError) -> Set<String>
  func setAttributes(_ attributes: [String: String])
  func logIn(_ appUserID: String) async throws(PurchasesBackendError)
  func logOut() async throws(PurchasesBackendError)
}

@MainActor
public final class StorePurchases: Purchases {
  static let turbo = "turbo"

  private let backend: (any PurchasesBackend)?

  public init(backend: (any PurchasesBackend)?) {
    self.backend = backend
  }

  public var isAvailable: Bool {
    backend != nil
  }

  public func offering(_ id: String?) async throws(PurchasesFailure) -> SubscriptionOffering {
    let catalog = try await run { backend throws(PurchasesBackendError) in try await backend.offerings() }
    guard let offering = id.flatMap({ catalog.all[$0] }) ?? catalog.current.flatMap({ catalog.all[$0] }) else {
      throw .noOffering
    }
    return offering
  }

  public func purchase(_ package: SubscriptionPackage) async throws(PurchasesFailure) -> PurchaseOutcome {
    let result = try await run { backend throws(PurchasesBackendError) in try await backend.purchase(package) }
    guard !result.cancelled else { return .cancelled }
    guard result.entitlements.contains(Self.turbo) else { throw .failed(code: "entitlement_missing") }
    return .subscribed
  }

  public func restore() async throws(PurchasesFailure) -> Bool {
    try await run { backend throws(PurchasesBackendError) in try await backend.restore() }.contains(Self.turbo)
  }

  public func isTurboActive() async throws(PurchasesFailure) -> Bool {
    try await run { backend throws(PurchasesBackendError) in try await backend.activeEntitlements() }.contains(Self.turbo)
  }

  public func setAttribute(_ value: String, for key: String) {
    backend?.setAttributes([key: value])
  }

  public func logIn(_ userID: UUID) async {
    try? await backend?.logIn(userID.uuidString.lowercased())
  }

  public func logOut() async {
    try? await backend?.logOut()
  }

  private func run<Value>(
    _ operation: @MainActor (any PurchasesBackend) async throws(PurchasesBackendError) -> Value
  ) async throws(PurchasesFailure) -> Value {
    guard let backend else { throw .unavailable }
    do {
      return try await operation(backend)
    } catch {
      switch error {
      case let .failed(code): throw .failed(code: code)
      }
    }
  }
}
