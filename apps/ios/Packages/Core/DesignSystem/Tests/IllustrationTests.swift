import CoreGraphics
@testable import DesignSystem
import Foundation
import ImageIO
import Testing
import UIKit

private struct IllustrationRect: Decodable {
  let x: Int
  let y: Int
  let width: Int
  let height: Int
}

private struct IllustrationControl: Decodable {
  let source: String
  let scrim: Double
}

private struct IllustrationDarkControl: Decodable {
  let source: String
  let background: String
}

private struct IllustrationTintEntry: Decodable {
  let name: String
  let color: String
}

private struct IllustrationEntry: Decodable {
  let name: String
  let source: String
  let rect: IllustrationRect
  let background: String
  let tints: [IllustrationTintEntry]
  let control: IllustrationControl?
  let dark: IllustrationDarkControl?
  let tolerance: Double?
}

private struct IllustrationManifest: Decodable {
  let illustrations: [IllustrationEntry]
}

private struct Pixels {
  let width: Int
  let height: Int
  let bytes: [UInt8]

  func channel(_ channel: Int, at index: Int) -> Double {
    Double(bytes[index * 4 + channel])
  }
}

private let sources = URL(fileURLWithPath: #filePath)
  .deletingLastPathComponent()
  .deletingLastPathComponent()
  .appendingPathComponent("Sources")

private let repositoryRoot = (0 ..< 7).reduce(URL(fileURLWithPath: #filePath)) { url, _ in
  url.deletingLastPathComponent()
}

private let tolerance = 3.0

private func manifest() throws -> IllustrationManifest {
  try JSONDecoder().decode(
    IllustrationManifest.self,
    from: Data(contentsOf: sources.appendingPathComponent("illustrations.json"))
  )
}

private func entry(of illustration: Illustration) throws -> IllustrationEntry {
  try #require(manifest().illustrations.first { $0.name == illustration.rawValue })
}

private func pixels(of url: URL, cropping rect: IllustrationRect? = nil) throws -> Pixels {
  let source = try #require(CGImageSourceCreateWithURL(url as CFURL, nil))
  let full = try #require(CGImageSourceCreateImageAtIndex(source, 0, nil))
  let image = try rect.map { rect in
    try #require(full.cropping(to: CGRect(x: rect.x, y: rect.y, width: rect.width, height: rect.height)))
  } ?? full
  let srgb = try #require(CGColorSpace(name: CGColorSpace.sRGB))
  var bytes = [UInt8](repeating: 0, count: image.width * image.height * 4)
  let drawn = bytes.withUnsafeMutableBytes { buffer in
    guard let context = CGContext(
      data: buffer.baseAddress,
      width: image.width,
      height: image.height,
      bitsPerComponent: 8,
      bytesPerRow: image.width * 4,
      space: srgb,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else { return false }
    context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    return true
  }
  try #require(drawn)
  return Pixels(width: image.width, height: image.height, bytes: bytes)
}

private func rgb(_ hex: String) -> [Double] {
  let value = Int(hex.dropFirst(), radix: 16) ?? 0
  return [16, 8, 0].map { Double((value >> $0) & 0xFF) }
}

private func maskURL(_ name: String) -> URL {
  sources.appendingPathComponent("Illustrations.xcassets/\(name).imageset/\(name)@3x.png")
}

private func recomposed(_ entry: IllustrationEntry, layers: [IllustrationLayer]) throws -> [[Double]] {
  let masks = try layers.map { try pixels(of: maskURL($0.mask)) }
  let tints = try layers.map { layer in try rgb(#require(entry.tints.first { $0.name == layer.tint.rawValue }).color) }
  let background = rgb(entry.background)
  return (0 ..< entry.rect.width * entry.rect.height).map { index in
    zip(masks, tints).reduce(background) { below, layer in
      let alpha = layer.0.channel(3, at: index) / 255
      return zip(below, layer.1).map { $0 * (1 - alpha) + $1 * alpha }
    }
  }
}

private func gaps(between expected: Pixels, and actual: [[Double]], veil: Double = 0) -> [Double] {
  actual.enumerated().map { index, color in
    (0 ..< 3).map { abs(expected.channel($0, at: index) - color[$0] * (1 - veil)) }.max() ?? 0
  }
}

private func largestGap(between expected: Pixels, and actual: [[Double]], veil: Double = 0) -> Double {
  gaps(between: expected, and: actual, veil: veil).max() ?? .infinity
}

private func count(of hex: String, in capture: Pixels) -> Int {
  let color = rgb(hex)
  return (0 ..< capture.width * capture.height).filter { index in
    (0 ..< 3).allSatisfy { abs(capture.channel($0, at: index) - color[$0]) <= tolerance }
  }.count
}

@Suite("Illustrations d'état vide extraites des captures (ADR 0052, ADR 0053)")
struct IllustrationTests {
  @Test("chaque illustration a son entrée dans le manifeste, qui cite une capture de docs/new-reference-ui/, sauf les lunettes (ADR 0053 §1)")
  func manifestCoversEveryIllustration() throws {
    let entries = try manifest().illustrations
    let older = entries.filter { !$0.source.hasPrefix("docs/new-reference-ui/") }

    #expect(Set(entries.map(\.name)) == Set(Illustration.allCases.map(\.rawValue)))
    #expect(older.map(\.name) == [Illustration.glasses.rawValue])
    #expect(older.map(\.source) == ["docs/reference-ui/creer/notifications-createur--vide.png"])
  }

  @Test("le manifeste donne les teintes de chaque illustration dans son ordre d'empilement (ADR 0053 §2)", arguments: Illustration.allCases)
  func manifestListsTintsInStackingOrder(illustration: Illustration) throws {
    let tints = try entry(of: illustration).tints.map(\.name)

    #expect(tints == illustration.layers.map(\.tint.rawValue))
  }

  @Test("chaque masque du catalogue a son entrée dans le manifeste, et l'inverse")
  func manifestMatchesAssetCatalog() throws {
    let catalog = try FileManager.default.contentsOfDirectory(
      atPath: sources.appendingPathComponent("Illustrations.xcassets").path
    )
    let masks = Set(catalog.filter { $0.hasSuffix(".imageset") }.map { String($0.dropLast(".imageset".count)) })
    let expected = try Set(manifest().illustrations.flatMap { entry in
      try #require(Illustration(rawValue: entry.name)).layers.map(\.mask)
    })

    #expect(masks == expected)
  }

  @Test("une illustration empile le remplissage, puis le contour, puis l'encre, chacun coloré par son rôle")
  func stacksLayersInOrder() {
    let layers = Illustration.clapperboard.layers

    #expect(layers.map(\.tint) == [.fill, .outline, .ink])
    #expect(layers.map(\.mask) == ["clapperboardFill", "clapperboardOutline", "clapperboardInk"])
    #expect(IllustrationTint.allCases.map(\.role) == [
      .illustrationAccent, .illustrationFill, .illustrationOutline, .illustrationHighlight, .illustrationInk,
      .illustrationBackdrop,
    ])
  }

  @Test("le personnage des chuchotements empile le losange gris, le remplissage, le contour, le jaune puis l'encre (IMG_9613)")
  func stacksCharacter() {
    let layers = Illustration.character.layers

    #expect(layers.map(\.tint) == [.backdrop, .fill, .outline, .highlight, .ink])
    #expect(layers.map(\.mask) == [
      "characterBackdrop", "characterFill", "characterOutline", "characterHighlight", "characterInk",
    ])
  }

  @Test("les lunettes des notifications empilent le carré violet, le remplissage, le contour, le jaune puis l'encre (ADR 0053 §1)")
  func stacksGlasses() {
    let layers = Illustration.glasses.layers

    #expect(layers.map(\.tint) == [.accent, .fill, .outline, .highlight, .ink])
    #expect(layers.map(\.mask) == ["glassesAccent", "glassesFill", "glassesOutline", "glassesHighlight", "glassesInk"])
  }

  @Test("le personnage de l'onglet « À propos » empile le losange violet, le remplissage, le contour, le jaune puis l'encre (IMG_9615)")
  func stacksCharacterOnPurple() {
    let layers = Illustration.characterOnPurple.layers

    #expect(layers.map(\.tint) == [.accent, .fill, .outline, .highlight, .ink])
    #expect(layers.map(\.mask) == [
      "characterOnPurpleAccent", "characterOnPurpleFill", "characterOnPurpleOutline",
      "characterOnPurpleHighlight", "characterOnPurpleInk",
    ])
  }

  @Test("chaque masque est un gabarit @3x à la taille de la découpe", arguments: Illustration.allCases)
  func loadsTemplateMasks(illustration: Illustration) throws {
    let rect = try entry(of: illustration).rect

    for layer in illustration.layers {
      let image = try #require(UIImage(named: layer.mask, in: .module, compatibleWith: UITraitCollection(displayScale: 3)))
      #expect(image.scale == 3)
      #expect(image.renderingMode == .alwaysTemplate)
      #expect(image.size == CGSize(width: CGFloat(rect.width) / 3, height: CGFloat(rect.height) / 3))
    }
    #expect(illustration.size == CGSize(width: CGFloat(rect.width) / 3, height: CGFloat(rect.height) / 3))
  }

  @Test("les masques recomposés sur le fond relevé redonnent la découpe de la capture", arguments: Illustration.allCases)
  func recomposesCapture(illustration: Illustration) throws {
    let entry = try entry(of: illustration)
    let capture = try pixels(of: repositoryRoot.appendingPathComponent(entry.source), cropping: entry.rect)
    let gaps = try gaps(between: capture, and: recomposed(entry, layers: illustration.layers))

    #expect(gaps.max() ?? .infinity <= entry.tolerance ?? tolerance)
    #expect(gaps.reduce(0, +) / Double(gaps.count) <= 0.5)
  }

  @Test("seule la capture compressée des lunettes a une tolérance élargie, sur une poignée de pixels de bord")
  func onlyGlassesHaveWiderTolerance() throws {
    let widened = try manifest().illustrations.filter { $0.tolerance != nil }

    #expect(widened.map(\.name) == [Illustration.glasses.rawValue])
    #expect(widened.map(\.tolerance) == [20])
  }

  @Test("sous le voile de la capture de contrôle, les masques recomposés redonnent sa découpe", arguments: Illustration.allCases)
  func recomposesControl(illustration: Illustration) throws {
    let entry = try entry(of: illustration)
    guard let control = entry.control else { return }
    let capture = try pixels(of: repositoryRoot.appendingPathComponent(control.source), cropping: entry.rect)

    #expect(try largestGap(between: capture, and: recomposed(entry, layers: illustration.layers), veil: control.scrim) <= tolerance)
  }

  @Test("en thème sombre, les lunettes gardent chacune de leurs teintes claires, seul le fond change (ADR 0053 §3)")
  func glassesKeepTheirTintsInDarkTheme() throws {
    let entry = try entry(of: .glasses)
    let dark = try #require(entry.dark)
    let lightCapture = try pixels(of: repositoryRoot.appendingPathComponent(entry.source), cropping: entry.rect)
    let darkCapture = try pixels(of: repositoryRoot.appendingPathComponent(dark.source), cropping: entry.rect)
    let pairs = entry.tints.map { ($0.color, $0.color) } + [(entry.background, dark.background)]

    #expect(dark.source == "docs/reference-ui/activite/notifications--vide-theme-sombre.png")
    for (lightColor, darkColor) in pairs {
      let lit = Double(count(of: lightColor, in: lightCapture))
      let unlit = Double(count(of: darkColor, in: darkCapture))
      #expect(lit > 1000)
      #expect(abs(unlit - lit) <= lit * 0.06)
    }
  }
}
