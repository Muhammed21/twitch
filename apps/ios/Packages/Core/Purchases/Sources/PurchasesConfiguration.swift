import Foundation

public struct PurchasesConfiguration: Equatable, Sendable {
  static let apiKeyInfoKey = "REVENUECAT_API_KEY"

  public let apiKey: String

  public init?(info: [String: Any]) {
    let key = (info[Self.apiKeyInfoKey] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    guard !key.isEmpty else { return nil }
    apiKey = key
  }
}
