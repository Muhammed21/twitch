import CoreGraphics
import DesignSystem
import Foundation
import SwiftUI
import Testing

private let iosRoot = URL(fileURLWithPath: #filePath)
  .deletingLastPathComponent()
  .appending(path: "../../../..")
  .standardized

private struct ColorSet: Decodable {
  struct Entry: Decodable {
    struct Value: Decodable {
      struct Components: Decodable {
        let red: String
        let green: String
        let blue: String
      }

      let components: Components
    }

    let color: Value
  }

  let colors: [Entry]
}

private func hex(of resolved: Color.Resolved) -> String? {
  guard
    let srgb = CGColorSpace(name: CGColorSpace.sRGB),
    let components = resolved.cgColor.converted(to: srgb, intent: .defaultIntent, options: nil)?.components
  else { return nil }
  return components.prefix(3)
    .map { String(format: "%02X", Int(($0 * 255).rounded())) }
    .joined()
}

@Suite("Écran de lancement natif")
struct LaunchScreenTests {
  @Test("affiche la couleur LaunchBackground du catalogue d'assets")
  func usesLaunchBackground() throws {
    let data = try Data(contentsOf: iosRoot.appending(path: "Info.plist"))
    let plist = try #require(try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any])
    let launchScreen = try #require(plist["UILaunchScreen"] as? [String: Any])

    #expect(launchScreen["UIColorName"] as? String == "LaunchBackground")
  }

  @Test(
    "LaunchBackground vaut le token accent, dans le thème clair et dans le thème sombre",
    arguments: [ColorScheme.light, ColorScheme.dark]
  )
  func launchBackgroundMatchesAccent(scheme: ColorScheme) throws {
    let data = try Data(
      contentsOf: iosRoot.appending(path: "App/Assets.xcassets/LaunchBackground.colorset/Contents.json")
    )
    let colors = try JSONDecoder().decode(ColorSet.self, from: data).colors
    let asset = colors.map { entry in
      [entry.color.components.red, entry.color.components.green, entry.color.components.blue]
        .map { $0.replacingOccurrences(of: "0x", with: "").uppercased() }
        .joined()
    }

    #expect(asset == [try #require(hex(of: ColorRole.accent.color.resolved(in: scheme)))])
  }
}
