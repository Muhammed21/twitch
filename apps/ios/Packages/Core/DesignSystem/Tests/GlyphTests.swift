@testable import DesignSystem
import Foundation
import Testing
import UIKit

private struct ManifestRect: Decodable {
  let width: Int
  let height: Int
}

private struct ManifestEntry: Decodable {
  let name: String
  let source: String
  let rect: ManifestRect
}

private struct Manifest: Decodable {
  let glyphs: [ManifestEntry]
}

private let sources = URL(fileURLWithPath: #filePath)
  .deletingLastPathComponent()
  .deletingLastPathComponent()
  .appendingPathComponent("Sources")

private func manifest() throws -> Manifest {
  try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: sources.appendingPathComponent("glyphs.json")))
}

@Suite("Glyphes d'interface extraits des captures (ADR 0046)")
struct GlyphTests {
  @Test("chaque glyphe a son entrée dans le manifeste, qui cite une capture de docs/reference-ui/")
  func manifestCoversEveryGlyph() throws {
    let entries = try manifest().glyphs

    #expect(Set(entries.map(\.name)) == Set(Glyph.allCases.map(\.rawValue)))
    #expect(entries.allSatisfy { $0.source.hasPrefix("docs/reference-ui/") })
  }

  @Test("chaque masque du catalogue a son entrée dans le manifeste, et l'inverse")
  func manifestMatchesAssetCatalog() throws {
    let catalog = try FileManager.default.contentsOfDirectory(atPath: sources.appendingPathComponent("Glyphs.xcassets").path)
    let masks = Set(catalog.filter { $0.hasSuffix(".imageset") }.map { String($0.dropLast(".imageset".count)) })

    #expect(try masks == Set(manifest().glyphs.map(\.name)))
  }

  @Test("chaque glyphe est un masque @3x en gabarit, à la taille de sa découpe", arguments: Glyph.allCases)
  func loadsTemplateMask(glyph: Glyph) throws {
    let entry = try #require(manifest().glyphs.first { $0.name == glyph.rawValue })
    let image = try #require(UIImage(named: glyph.rawValue, in: .module, compatibleWith: UITraitCollection(displayScale: 3)))

    #expect(image.scale == 3)
    #expect(image.renderingMode == .alwaysTemplate)
    #expect(image.size == CGSize(width: CGFloat(entry.rect.width) / 3, height: CGFloat(entry.rect.height) / 3))
  }

  @Test("un onglet actif prend le glyphe plein, un onglet inactif le glyphe au trait")
  func tabGlyphFollowsSelection() {
    let glyph = TabBarGlyph.mask(outline: .homeOutline, filled: .homeFilled)

    #expect(glyph.mask(isSelected: true) == .homeFilled)
    #expect(glyph.mask(isSelected: false) == .homeOutline)
    #expect(TabBarGlyph.avatar.mask(isSelected: true) == nil)
  }
}
