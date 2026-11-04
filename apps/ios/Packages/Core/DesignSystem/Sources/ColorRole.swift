import DesignTokens
import Foundation
import SwiftUI

public enum ColorRole: Equatable, Sendable {
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
  case link
  case chatName(UUID)
  case danger
  case onDanger
  case scrim
  case navigationActive
  case border
  case avatarDefault
  case onAvatarDefault
  case liveIndicator
  case mediaBackground
  case liveBadge
  case onLiveBadge
  case onMedia

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
    case .link: .textLink
    case let .chatName(author): Self.chatNames[Self.stableIndex(of: author, count: Self.chatNames.count)]
    case .danger: .dangerDefault
    case .onDanger: .dangerOnDanger
    case .scrim: .overlayScrim
    case .navigationActive: .navigationActive
    case .border: .borderSubtle
    case .avatarDefault: .avatarDefault
    case .onAvatarDefault: .avatarOnDefault
    case .liveIndicator: .indicatorLive
    case .mediaBackground: .mediaBackground
    case .liveBadge: .liveBadge
    case .onLiveBadge: .liveOnBadge
    case .onMedia: .mediaOnOverlay
    }
  }

  private static let chatNames: [Color] = [
    .chatNameBlue, .chatNameGreen, .chatNamePurple, .chatNameRed, .chatNameMaroon, .chatNameTeal, .chatNameIndigo,
  ]

  private static func stableIndex(of id: UUID, count: Int) -> Int {
    let bytes = withUnsafeBytes(of: id.uuid) { Array($0) }
    let hash = bytes.reduce(UInt32(2_166_136_261)) { ($0 ^ UInt32($1)) &* 16_777_619 }
    return Int(hash % UInt32(count))
  }
}

public extension Color {
  func resolved(in scheme: ColorScheme) -> Color.Resolved {
    var environment = EnvironmentValues()
    environment.colorScheme = scheme
    return resolve(in: environment)
  }
}
