import CoreGraphics
import DesignTokens
import SwiftUI

public enum ChatNameColor: String, CaseIterable, Sendable {
  case blue
  case green
  case purple
  case red
  case maroon
  case teal
  case indigo

  public init?(hex: String) {
    guard let match = Self.allCases.first(where: { $0.hex == hex.uppercased() }) else { return nil }
    self = match
  }

  public var color: Color {
    switch self {
    case .blue: .chatNameBlue
    case .green: .chatNameGreen
    case .purple: .chatNamePurple
    case .red: .chatNameRed
    case .maroon: .chatNameMaroon
    case .teal: .chatNameTeal
    case .indigo: .chatNameIndigo
    }
  }

  public var hex: String {
    let resolved = color.resolved(in: .light)
    let components = CGColorSpace(name: CGColorSpace.sRGB)
      .flatMap { resolved.cgColor.converted(to: $0, intent: .defaultIntent, options: nil)?.components } ?? []
    return "#" + components.prefix(3).map { String(format: "%02X", Int(($0 * 255).rounded())) }.joined()
  }
}
