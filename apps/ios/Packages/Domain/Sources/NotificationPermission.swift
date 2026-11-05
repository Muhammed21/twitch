public enum NotificationAuthorization: Equatable, Sendable {
  case notDetermined
  case granted
  case denied
}

public protocol NotificationPermission: Sendable {
  func authorization() async -> NotificationAuthorization
  func request() async -> Bool
}
