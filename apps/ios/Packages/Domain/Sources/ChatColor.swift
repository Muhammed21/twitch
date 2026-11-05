@MainActor
public protocol ChatColorUpdating: AnyObject {
  func setChatColor(_ hex: String?) async throws
}
