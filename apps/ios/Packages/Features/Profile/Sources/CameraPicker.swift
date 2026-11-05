import SwiftUI
import UIKit

struct CameraPicker: UIViewControllerRepresentable {
  let onShot: (Data?) -> Void
  let onClose: () -> Void

  func makeUIViewController(context: Context) -> UIImagePickerController {
    let picker = UIImagePickerController()
    picker.sourceType = .camera
    picker.delegate = context.coordinator
    return picker
  }

  func updateUIViewController(_: UIImagePickerController, context _: Context) {}

  func makeCoordinator() -> Coordinator {
    Coordinator(onShot: onShot, onClose: onClose)
  }

  final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    private let onShot: (Data?) -> Void
    private let onClose: () -> Void

    init(onShot: @escaping (Data?) -> Void, onClose: @escaping () -> Void) {
      self.onShot = onShot
      self.onClose = onClose
    }

    func imagePickerController(_: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
      onClose()
      onShot((info[.originalImage] as? UIImage)?.jpegData(compressionQuality: 1))
    }

    func imagePickerControllerDidCancel(_: UIImagePickerController) {
      onClose()
    }
  }
}
