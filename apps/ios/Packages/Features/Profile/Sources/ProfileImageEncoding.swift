import Foundation
import UIKit

public enum ProfileImageEncoding {
  private static let quality: CGFloat = 0.85

  public static func jpeg(from data: Data) -> Data? {
    UIImage(data: data)?.jpegData(compressionQuality: quality)
  }
}
