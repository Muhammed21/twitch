import CoreGraphics
@testable import DesignSystem
import SwiftUI
import Testing

private struct Rendered {
  let width: Int
  let height: Int
  let bytes: [UInt8]

  func row(_ row: Int, differsFrom background: [UInt8]) -> Bool {
    (0 ..< width).contains { column in
      let start = (row * width + column) * 4
      return (0 ..< 3).contains { abs(Int(bytes[start + $0]) - Int(background[$0])) > 3 }
    }
  }
}

@MainActor
private func render(_ view: some View, width: CGFloat) throws -> Rendered {
  let renderer = ImageRenderer(
    content: view
      .frame(width: width)
      .background(ColorRole.background.color)
      .environment(\.colorScheme, .light)
  )
  renderer.scale = 3
  let image = try #require(renderer.cgImage)
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
  return Rendered(width: image.width, height: image.height, bytes: bytes)
}

private func inkRuns(of rendered: Rendered) -> [ClosedRange<Int>] {
  let background = Array(rendered.bytes[0 ..< 3])
  let inked = (0 ..< rendered.height).filter { rendered.row($0, differsFrom: background) }
  return inked.reduce(into: [ClosedRange<Int>]()) { runs, row in
    guard let last = runs.last, last.upperBound == row - 1 else {
      runs.append(row ... row)
      return
    }
    runs[runs.count - 1] = last.lowerBound ... row
  }
}

@Suite("Page Activité : illustration de l'état vide (ADR 0053 ; IMG_9613, docs/reference-ui/creer/notifications-createur--vide)")
struct ActivityEmptyIllustrationTests {
  @Test("chaque onglet pose son illustration : les lunettes sur Notifications, le personnage sur Chuchotements")
  func illustrations() {
    #expect(ActivityEmptyIllustration.notifications.illustration == .glasses)
    #expect(ActivityEmptyIllustration.whispers.illustration == .character)
    #expect(ActivityEmptyIllustration.notifications.gap.points == 20)
    #expect(ActivityEmptyIllustration.whispers.gap.points == 19)
  }

  @Test(
    "rendue à @3x, l'illustration finit à l'écart relevé du titre, en pixels de la capture",
    arguments: [
      (ActivityEmptyIllustration.whispers, "Aucun chuchotement disponible", 65),
      (ActivityEmptyIllustration.notifications, "You’re all caught up. What a pro!", 80),
    ]
  )
  @MainActor
  func renderedGap(illustration: ActivityEmptyIllustration, title: String, blankRows: Int) throws {
    let rendered = try render(
      ActivityEmptyState(title: title, message: "", illustration: illustration).fixedSize(horizontal: false, vertical: true),
      width: 393
    )
    let runs = inkRuns(of: rendered)
    let picture = try #require(runs.max { $0.count < $1.count })
    let heading = try #require(runs.first { $0.lowerBound > picture.upperBound })

    #expect(abs(heading.lowerBound - picture.upperBound - 1 - blankRows) <= 3)
  }

  @Test("rendue à @3x, l'illustration est centrée sur la largeur de l'écran", arguments: [
    ActivityEmptyIllustration.whispers, .notifications,
  ])
  @MainActor
  func renderedCentered(illustration: ActivityEmptyIllustration) throws {
    let rendered = try render(IllustrationImage(illustration.illustration), width: 393)
    let background = Array(rendered.bytes[0 ..< 3])
    let columns = (0 ..< rendered.width).filter { column in
      (0 ..< rendered.height).contains { row in
        let start = (row * rendered.width + column) * 4
        return (0 ..< 3).contains { abs(Int(rendered.bytes[start + $0]) - Int(background[$0])) > 3 }
      }
    }
    let first = try #require(columns.first)
    let last = try #require(columns.last)
    let capture = illustration == .whispers ? 362 ... 843 : 344 ... 863

    #expect(abs(first + last - capture.lowerBound - capture.upperBound) <= 6)
    #expect(abs(last - first - capture.count + 1) <= 6)
  }
}
