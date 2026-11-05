import SwiftUI

public enum Glyph: String, CaseIterable, Sendable {
  case homeOutline
  case homeFilled
  case browseOutline
  case browseFilled
  case plus
  case avatarPerson
  case editPencil

  public var image: Image {
    Image(rawValue, bundle: .module).renderingMode(.template)
  }
}
