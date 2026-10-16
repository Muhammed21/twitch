import DesignTokens
import SwiftUI

public enum ColorRole: Sendable {
  case background
  case accent
  case onAccent

  public var color: Color {
    switch self {
    case .background: .backgroundPrimary
    case .accent: .accentDefault
    case .onAccent: .accentOnAccent
    }
  }
}

public extension Color {
  func resolved(in scheme: ColorScheme) -> Color.Resolved {
    var environment = EnvironmentValues()
    environment.colorScheme = scheme
    return resolve(in: environment)
  }
}
