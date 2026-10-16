import CoreGraphics
import DesignSystem
import SwiftUI
import Testing

private let tenthOfViewBox = CGRect(x: 0, y: 0, width: 240, height: 280)

private func tenth(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
  CGPoint(x: x / 10, y: y / 10)
}

private func isClose(_ lhs: CGRect, _ rhs: CGRect) -> Bool {
  [lhs.minX - rhs.minX, lhs.minY - rhs.minY, lhs.width - rhs.width, lhs.height - rhs.height]
    .allSatisfy { abs($0) < 1e-9 }
}

private let officialWhiteGlitch: String = {
  let root = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .appending(path: "../../../../../..")
    .standardized
  return (try? String(contentsOf: root.appending(path: "docs/brand/twitch-glitch-white.svg"), encoding: .utf8)) ?? ""
}()

@Suite("Glitch, tracé du SVG officiel")
struct GlitchTests {
  @Test("le tracé de la bulle est celui du SVG officiel, sans retouche")
  func bubbleMatchesOfficialSVG() throws {
    let match = try #require(officialWhiteGlitch.firstMatch(of: /<path[^>]* d="([^"]*)"/))
    let official = match.1.split(whereSeparator: \.isWhitespace).joined(separator: " ")

    #expect(GlitchBubble.pathData == official)
  }

  @Test("les yeux sont les rectangles du SVG officiel, sans retouche")
  func eyesMatchOfficialSVG() {
    let official = officialWhiteGlitch
      .matches(of: /<rect x="(\d+)" y="(\d+)" class="st0" width="(\d+)" height="(\d+)"/)
      .compactMap { match -> CGRect? in
        guard let x = Double(match.1), let y = Double(match.2), let width = Double(match.3), let height = Double(match.4)
        else { return nil }
        return CGRect(x: x, y: y, width: width, height: height)
      }

    #expect(official.count == 2)
    #expect(GlitchEyes.viewBoxRects == official)
  }

  @Test("la bulle occupe tout le cadre quand il a les proportions du SVG")
  func bubbleFillsMatchingFrame() {
    #expect(isClose(GlitchBubble().path(in: tenthOfViewBox).boundingRect, tenthOfViewBox))
  }

  @Test("la bulle garde les proportions du SVG et se centre dans un cadre plus large")
  func bubbleKeepsAspectRatio() {
    let wide = CGRect(x: 0, y: 0, width: 480, height: 280)

    #expect(isClose(GlitchBubble().path(in: wide).boundingRect, CGRect(x: 120, y: 0, width: 240, height: 280)))
  }

  @Test("la bulle garde les proportions du SVG et se centre dans un cadre plus haut")
  func bubbleKeepsAspectRatioInTallFrame() {
    let tall = CGRect(x: 0, y: 0, width: 240, height: 560)

    #expect(isClose(GlitchBubble().path(in: tall).boundingRect, CGRect(x: 0, y: 140, width: 240, height: 280)))
  }

  @Test(
    "la bulle est pleine sur son contour et sa queue, vide à l'intérieur et hors des coins coupés",
    arguments: [
      (tenth(300, 1000), true),
      (tenth(700, 2500), true),
      (tenth(1400, 1000), false),
      (tenth(2300, 2000), false),
      (tenth(100, 100), false),
    ]
  )
  func bubbleFill(point: CGPoint, filled: Bool) {
    #expect(GlitchBubble().path(in: tenthOfViewBox).contains(point, eoFill: true) == filled)
  }

  @Test(
    "le contour suit les bords de la bulle sans relier ses deux sous-chemins",
    arguments: [
      (tenth(1000, 0), true),
      (tenth(600, 1000), true),
      (tenth(1350, 650), false),
    ]
  )
  func outlineStroke(point: CGPoint, stroked: Bool) {
    let outline = GlitchBubble().path(in: tenthOfViewBox).strokedPath(StrokeStyle(lineWidth: 1))

    #expect(outline.contains(point) == stroked)
  }

  @Test(
    "les yeux sont deux barres verticales, séparées par un vide",
    arguments: [
      (tenth(1250, 850), true),
      (tenth(1800, 850), true),
      (tenth(1500, 850), false),
      (tenth(1250, 500), false),
      (tenth(1250, 1200), false),
    ]
  )
  func eyes(point: CGPoint, filled: Bool) {
    #expect(GlitchEyes().path(in: tenthOfViewBox).contains(point) == filled)
  }

  @Test("les yeux clignent autour de leur centre vertical")
  func blinkAnchor() {
    let eyes = GlitchEyes().path(in: tenthOfViewBox).boundingRect

    #expect(abs(GlitchEyes.blinkAnchor.y - eyes.midY / tenthOfViewBox.height) < 1e-9)
    #expect(GlitchEyes.blinkAnchor.x == 0.5)
  }
}
