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

  public func inline(side: CGFloat) -> UIImage? {
    guard let mask = UIImage(named: rawValue, in: .module, compatibleWith: nil) else { return nil }
    let size = CGSize(width: side, height: side)
    return UIGraphicsImageRenderer(size: size)
      .image { _ in mask.draw(in: CGRect(origin: .zero, size: size)) }
      .withRenderingMode(.alwaysTemplate)
  }
}
