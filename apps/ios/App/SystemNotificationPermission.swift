import Domain
import UserNotifications

struct SystemNotificationPermission: NotificationPermission {
  func authorization() async -> NotificationAuthorization {
    switch await UNUserNotificationCenter.current().notificationSettings().authorizationStatus {
    case .notDetermined: .notDetermined
    case .denied: .denied
    case .authorized, .provisional, .ephemeral: .granted
    @unknown default: .denied
    }
  }

  func request() async -> Bool? {
    try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
  }
}
