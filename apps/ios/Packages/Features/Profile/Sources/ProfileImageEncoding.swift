import Domain
import Foundation
import ImageIO
import UIKit

public enum PreparedImage: Equatable, Sendable {
  case jpeg(Data)
  case tooSmall
  case unreadable
}

public enum ProfileImageEncoding {
  private static let quality: CGFloat = 0.85
  private static let firstAxisSwappingOrientation = 5

  @Sendable
  public static func prepare(_ data: Data, for purpose: ImagePurpose) -> PreparedImage {
    guard
      let source = CGImageSourceCreateWithData(data as CFData, nil),
      let size = shownSize(of: source)
    else { return .unreadable }
    guard size.covers(purpose.minimumSize) else { return .tooSmall }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: longestSide(of: size, covering: purpose.outputSize),
    ]
    guard
      let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
      let jpeg = UIImage(cgImage: image).jpegData(compressionQuality: quality)
    else { return .unreadable }
    return .jpeg(jpeg)
  }

  private static func shownSize(of source: CGImageSource) -> PixelSize? {
    guard
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let width = properties[kCGImagePropertyPixelWidth] as? Int,
      let height = properties[kCGImagePropertyPixelHeight] as? Int
    else { return nil }
    let orientation = properties[kCGImagePropertyOrientation] as? Int ?? 1
    return orientation >= firstAxisSwappingOrientation
      ? PixelSize(width: height, height: width)
      : PixelSize(width: width, height: height)
  }

  private static func longestSide(of size: PixelSize, covering output: PixelSize) -> Int {
    let scale = min(1, max(Double(output.width) / Double(size.width), Double(output.height) / Double(size.height)))
    return Int((Double(max(size.width, size.height)) * scale).rounded(.up))
  }
}
