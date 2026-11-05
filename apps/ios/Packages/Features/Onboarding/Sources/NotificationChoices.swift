import Domain
import Observation

@MainActor
@Observable
public final class NotificationChoices {
  public private(set) var authorization: NotificationAuthorization?

  private let permission: any NotificationPermission
  private let onAnswer: @MainActor (Bool) -> Void

  public init(permission: any NotificationPermission, onAnswer: @escaping @MainActor (Bool) -> Void) {
    self.permission = permission
    self.onAnswer = onAnswer
  }

  public func load() async {
    authorization = await permission.authorization()
  }

  public func turnOn() async -> NotificationAuthorization {
    let current = await permission.authorization()
    guard current == .notDetermined else {
      authorization = current
      return current
    }
    guard let isGranted = await permission.request() else {
      authorization = current
      return current
    }
    let answered: NotificationAuthorization = isGranted ? .granted : .denied
    authorization = answered
    onAnswer(isGranted)
    return answered
  }
}

public enum NotificationPass: Equatable, Sendable {
  case skip
  case back

  public init?(authorization: NotificationAuthorization, direction: JourneyDirection) {
    guard authorization != .notDetermined else { return nil }
    self = direction == .forward ? .skip : .back
  }
}
