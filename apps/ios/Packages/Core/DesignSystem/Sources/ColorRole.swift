import DesignTokens
import SwiftUI

public enum ColorRole: Sendable {
  case background
  case accent
  case onAccent
  case onAccentStrong
  case onAccentMuted
  case accentSubtle
  case surface
  case surfaceSecondary
  case surfaceTertiary
  case textPrimary
  case textSecondary
  case danger
  case onDanger
  case scrim

  public var color: Color {
    switch self {
    case .background: .backgroundPrimary
    case .accent: .accentDefault
    case .onAccent: .accentOnAccent
    case .onAccentStrong: .accentOnAccentStrong
    case .onAccentMuted: .accentOnAccentMuted
    case .accentSubtle: .accentSubtle
    case .surface: .surfacePrimary
    case .surfaceSecondary: .surfaceSecondary
    case .surfaceTertiary: .surfaceTertiary
    case .textPrimary: .textPrimary
    case .textSecondary: .textSecondary
    case .danger: .dangerDefault
    case .onDanger: .dangerOnDanger
    case .scrim: .overlayScrim
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
