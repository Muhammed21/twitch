import AVFoundation
import UIKit

public enum CameraStatus: Sendable {
  case missing
  case undetermined
  case allowed
  case refused
}

public protocol CameraAccess: Sendable {
  @MainActor func status() -> CameraStatus
  func requestAccess() async -> Bool
}

public struct DeviceCamera: CameraAccess {
  public init() {}

  @MainActor
  public func status() -> CameraStatus {
    guard UIImagePickerController.isSourceTypeAvailable(.camera) else { return .missing }
    return switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: .allowed
    case .notDetermined: .undetermined
    default: .refused
    }
  }

  public func requestAccess() async -> Bool {
    await AVCaptureDevice.requestAccess(for: .video)
  }
}
