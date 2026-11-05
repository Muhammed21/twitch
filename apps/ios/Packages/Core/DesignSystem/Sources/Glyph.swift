import SwiftUI
import UIKit

public enum Glyph: String, CaseIterable, Sendable {
  case homeOutline
  case homeFilled
  case browseOutline
  case browseFilled
  case plus
  case avatarPerson
  case editPencil
  case turboBattery

  public var image: Image {
    Image(rawValue, bundle: .module).renderingMode(.template)
  }

  @MainActor
  public func inline(side: CGFloat) -> UIImage? {
    InlineGlyphs.image(of: self, side: side)
  }
}

@MainActor
private enum InlineGlyphs {
  private struct Key: Hashable {
    let glyph: Glyph
    let side: CGFloat
  }

  private static var images: [Key: UIImage] = [:]

  static func image(of glyph: Glyph, side: CGFloat) -> UIImage? {
    let key = Key(glyph: glyph, side: side)
    if let cached = images[key] {
      return cached
    }
    guard let mask = UIImage(named: glyph.rawValue, in: .module, compatibleWith: nil) else { return nil }
    let size = CGSize(width: side, height: side)
    let image = UIGraphicsImageRenderer(size: size)
      .image { _ in mask.draw(in: CGRect(origin: .zero, size: size)) }
      .withRenderingMode(.alwaysTemplate)
    images[key] = image
    return image
  }
}
