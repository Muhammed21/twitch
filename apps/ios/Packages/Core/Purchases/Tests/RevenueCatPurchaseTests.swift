@testable import Purchases
@preconcurrency import RevenueCat
import Testing

@Suite("Issue d'un achat RevenueCat")
@MainActor
struct RevenueCatPurchaseTests {
  @Test("une feuille StoreKit fermée lève purchaseCancelledError en async : l'achat est annulé, pas en échec")
  func cancelledByError() async throws {
    let result = try await RevenueCatBackend.settle { throw ErrorCode.purchaseCancelledError }

    #expect(result == StorePurchaseResult(cancelled: true, entitlements: []))
  }

  @Test("une autre erreur du SDK reste un échec qui porte son code")
  func otherError() async {
    await #expect(throws: PurchasesBackendError.failed(code: String(describing: ErrorCode.networkError))) {
      try await RevenueCatBackend.settle { throw ErrorCode.networkError }
    }
  }

  @Test("un achat abouti rend le résultat du SDK")
  func completed() async throws {
    let expected = StorePurchaseResult(cancelled: false, entitlements: ["turbo"])

    #expect(try await RevenueCatBackend.settle { expected } == expected)
  }
}
