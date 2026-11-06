import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct Rect: Decodable {
  let x: Int
  let y: Int
  let width: Int
  let height: Int
}

struct Separation: Decodable {
  let pureWithin: Double
  let neighbourhood: Int
}

struct Tint: Decodable {
  let name: String
  let color: String
}

struct Entry: Decodable {
  let name: String
  let source: String
  let rect: Rect
  let background: String
  let tints: [Tint]
  let separation: Separation
}

struct Manifest: Decodable {
  let illustrations: [Entry]
}

struct Split {
  let alphas: [Int: Double]
  let error: Double

  init(lower: Int, upper: Int, share: Double, error: Double) {
    alphas = Dictionary([(lower, 1), (upper, share)]) { _, upper in upper }
    self.error = error
  }

  init(alphas: [Int: Double], error: Double) {
    self.alphas = alphas
    self.error = error
  }
}

typealias RGB = [Double]

let root = (0 ..< 4).reduce(URL(fileURLWithPath: #filePath)) { url, _ in url.deletingLastPathComponent() }
let designSystem = root.appendingPathComponent("apps/ios/Packages/Core/DesignSystem/Sources")

func rgb(_ hex: String) -> RGB {
  let value = Int(hex.dropFirst(), radix: 16) ?? 0
  return [16, 8, 0].map { Double((value >> $0) & 0xFF) }
}

func crop(_ entry: Entry) throws -> [RGB] {
  let url = root.appendingPathComponent(entry.source)
  guard
    let source = CGImageSourceCreateWithURL(url as CFURL, nil),
    let full = CGImageSourceCreateImageAtIndex(source, 0, nil),
    let image = full.cropping(to: CGRect(x: entry.rect.x, y: entry.rect.y, width: entry.rect.width, height: entry.rect.height)),
    let srgb = CGColorSpace(name: CGColorSpace.sRGB)
  else { throw CocoaError(.fileReadCorruptFile) }
  var bytes = [UInt8](repeating: 0, count: image.width * image.height * 4)
  bytes.withUnsafeMutableBytes { buffer in
    let context = CGContext(
      data: buffer.baseAddress,
      width: image.width,
      height: image.height,
      bitsPerComponent: 8,
      bytesPerRow: image.width * 4,
      space: srgb,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )
    context?.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
  }
  return stride(from: 0, to: bytes.count, by: 4).map { start in bytes[start ..< start + 3].map(Double.init) }
}

func gap(_ first: RGB, _ second: RGB) -> Double {
  zip(first, second).map { abs($0 - $1) }.max() ?? 0
}

func pureLabels(_ pixels: [RGB], palette: [RGB], within: Double) -> [Int?] {
  pixels.map { pixel in
    let gaps = palette.map { gap(pixel, $0) }
    guard let best = gaps.min(), best <= within else { return nil }
    return gaps.firstIndex(of: best)
  }
}

func neighbourCounts(at index: Int, labels: [Int?], width: Int, radius: Int) -> [Int: Int] {
  let height = labels.count / width
  let (row, column) = (index / width, index % width)
  let rows = max(0, row - radius) ... min(height - 1, row + radius)
  let columns = max(0, column - radius) ... min(width - 1, column + radius)
  let found = rows.flatMap { row in columns.compactMap { labels[row * width + $0] } }
  return Dictionary(found.map { ($0, 1) }, uniquingKeysWith: +)
}

func projection(_ pixel: RGB, from lower: RGB, to upper: RGB) -> (share: Double, error: Double) {
  let axis = zip(upper, lower).map { $0 - $1 }
  let offset = zip(pixel, lower).map { $0 - $1 }
  let length = axis.map { $0 * $0 }.reduce(0, +)
  let share = min(1, max(0, zip(axis, offset).map { $0 * $1 }.reduce(0, +) / length))
  let error = gap(pixel, zip(lower, axis).map { $0 + share * $1 })
  return (share, error)
}

func split(_ pixel: RGB, counts: [Int: Int], palette: [RGB]) -> Split {
  let labels = counts.keys.sorted()
  let pairs = labels.flatMap { lower in labels.filter { $0 > lower }.map { (lower, $0) } }
  let scored = pairs.map { pair in
    (pair: pair, fit: projection(pixel, from: palette[pair.0], to: palette[pair.1]), weight: counts[pair.0, default: 0] + counts[pair.1, default: 0])
  }
  let best = scored.map(\.fit.error).min() ?? 0
  let chosen = scored.filter { $0.fit.error <= best + 2 }.max { $0.weight < $1.weight }
  guard let chosen else { return Split(lower: 0, upper: 0, share: 0, error: 0) }
  return Split(lower: chosen.pair.0, upper: chosen.pair.1, share: chosen.fit.share, error: chosen.fit.error)
}

func blend(_ pixel: RGB, of tints: [Int], palette: [RGB]) -> Split? {
  let (first, second, third) = (palette[tints[0]], palette[tints[1]], palette[tints[2]])
  let towardSecond = zip(second, first).map { $0 - $1 }
  let towardThird = zip(third, first).map { $0 - $1 }
  let offset = zip(pixel, first).map { $0 - $1 }
  let dot = { (lhs: RGB, rhs: RGB) in zip(lhs, rhs).map { $0 * $1 }.reduce(0, +) }
  let secondSquared = dot(towardSecond, towardSecond)
  let crossed = dot(towardSecond, towardThird)
  let thirdSquared = dot(towardThird, towardThird)
  let determinant = secondSquared * thirdSquared - crossed * crossed
  guard abs(determinant) > 1e-9 else { return nil }
  let alongSecond = dot(offset, towardSecond)
  let alongThird = dot(offset, towardThird)
  let secondShare = (alongSecond * thirdSquared - alongThird * crossed) / determinant
  let thirdShare = (alongThird * secondSquared - alongSecond * crossed) / determinant
  guard secondShare >= 0, thirdShare >= 0, secondShare + thirdShare <= 1, thirdShare < 1 else { return nil }
  let mixed = first.indices.map { first[$0] + secondShare * towardSecond[$0] + thirdShare * towardThird[$0] }
  let alphas = [tints[0]: 1, tints[1]: secondShare / (1 - thirdShare), tints[2]: thirdShare]
  return Split(alphas: alphas, error: gap(pixel, mixed))
}

func junction(_ pixel: RGB, counts: [Int: Int], palette: [RGB]) -> Split? {
  let labels = counts.keys.sorted()
  let triples = labels.flatMap { first in
    labels.filter { $0 > first }.flatMap { second in labels.filter { $0 > second }.map { [first, second, $0] } }
  }
  return triples.compactMap { blend(pixel, of: $0, palette: palette) }.min { $0.error < $1.error }
}

func splits(of entry: Entry, palette: [RGB]) throws -> [Split] {
  let pixels = try crop(entry)
  let labels = pureLabels(pixels, palette: palette, within: entry.separation.pureWithin)
  return pixels.indices.map { index in
    if let label = labels[index] {
      return Split(lower: 0, upper: label, share: 1, error: 0)
    }
    let widest = entry.separation.neighbourhood * 4
    let counts = stride(from: entry.separation.neighbourhood, through: widest, by: 1)
      .lazy
      .map { neighbourCounts(at: index, labels: labels, width: entry.rect.width, radius: $0) }
      .first { $0.count >= 2 } ?? [0: 1, 1: 1]
    let local = split(pixels[index], counts: counts, palette: palette)
    guard local.error > entry.separation.pureWithin else { return local }
    let everyTint = Dictionary(uniqueKeysWithValues: palette.indices.map { ($0, counts[$0, default: 0]) })
    let wide = split(pixels[index], counts: everyTint, palette: palette)
    guard wide.error > entry.separation.pureWithin,
          let meeting = junction(pixels[index], counts: everyTint, palette: palette),
          meeting.error < wide.error
    else { return wide }
    return meeting
  }
}

func alpha(of layer: Int, in split: Split) -> Double {
  split.alphas[layer] ?? 0
}

func writeMask(_ alphas: [Double], entry: Entry, name: String) throws {
  let folder = designSystem.appendingPathComponent("Illustrations.xcassets/\(name).imageset")
  try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
  let bytes = alphas.flatMap { [255, 255, 255, UInt8(($0 * 255).rounded())] }
  guard
    let provider = CGDataProvider(data: Data(bytes) as CFData),
    let srgb = CGColorSpace(name: CGColorSpace.sRGB),
    let image = CGImage(
      width: entry.rect.width,
      height: entry.rect.height,
      bitsPerComponent: 8,
      bitsPerPixel: 32,
      bytesPerRow: entry.rect.width * 4,
      space: srgb,
      bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.last.rawValue),
      provider: provider,
      decode: nil,
      shouldInterpolate: false,
      intent: .defaultIntent
    ),
    let destination = CGImageDestinationCreateWithURL(
      folder.appendingPathComponent("\(name)@3x.png") as CFURL, UTType.png.identifier as CFString, 1, nil
    )
  else { throw CocoaError(.fileWriteUnknown) }
  CGImageDestinationAddImage(destination, image, nil)
  guard CGImageDestinationFinalize(destination) else { throw CocoaError(.fileWriteUnknown) }
  try contents(for: name).write(to: folder.appendingPathComponent("Contents.json"), atomically: true, encoding: .utf8)
}

func contents(for name: String) -> String {
  """
  {
    "images": [
      {
        "idiom": "universal",
        "scale": "1x"
      },
      {
        "idiom": "universal",
        "scale": "2x"
      },
      {
        "filename": "\(name)@3x.png",
        "idiom": "universal",
        "scale": "3x"
      }
    ],
    "info": {
      "author": "xcode",
      "version": 1
    },
    "properties": {
      "template-rendering-intent": "template"
    }
  }

  """
}

func extract(_ entry: Entry) throws {
  let palette = [rgb(entry.background)] + entry.tints.map { rgb($0.color) }
  let pixels = try splits(of: entry, palette: palette)
  for (offset, tint) in entry.tints.map(\.name).enumerated() {
    let name = entry.name + tint.prefix(1).uppercased() + tint.dropFirst()
    try writeMask(pixels.map { alpha(of: offset + 1, in: $0) }, entry: entry, name: name)
    print("\(name) : \(entry.source) \(entry.rect.x),\(entry.rect.y) \(entry.rect.width)×\(entry.rect.height)")
  }
}

let manifest = try JSONDecoder().decode(
  Manifest.self,
  from: Data(contentsOf: designSystem.appendingPathComponent("illustrations.json"))
)
try manifest.illustrations.forEach(extract)
