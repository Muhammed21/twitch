import Foundation

public enum ChannelTag {
  public static let maxCount = 10
  public static let maxLength = 25

  public static func normalized(_ raw: String) -> String? {
    let decomposed = raw.trimmingCharacters(in: .whitespacesAndNewlines).decomposedStringWithCanonicalMapping
    let tag = String(String.UnicodeScalarView(withoutLatinMarks(decomposed.unicodeScalars)))
      .precomposedStringWithCanonicalMapping
      .lowercased()
    let isWord = tag.unicodeScalars.allSatisfy { allowed.contains($0) }
    guard !tag.isEmpty, tag.count <= maxLength, isWord else { return nil }
    return tag
  }

  private static let allowed = CharacterSet.letters.union(.decimalDigits).union(.nonBaseCharacters)
  private static let latin: [ClosedRange<UInt32>] = [0x41 ... 0x5A, 0x61 ... 0x7A, 0xC0 ... 0x24F, 0x1E00 ... 0x1EFF]

  private static func withoutLatinMarks(_ scalars: String.UnicodeScalarView) -> [Unicode.Scalar] {
    scalars.reduce(into: (kept: [Unicode.Scalar](), afterLatin: false)) { state, scalar in
      let isMark = CharacterSet.nonBaseCharacters.contains(scalar)
      if !(isMark && state.afterLatin) {
        state.kept.append(scalar)
      }
      if !isMark {
        state.afterLatin = latin.contains { $0.contains(scalar.value) }
      }
    }.kept
  }
}

public struct StreamInfo: Equatable, Sendable {
  public var title: String
  public var category: ChannelCategory?
  public private(set) var tags: [String]
  public var language: LiveLanguage?
  public private(set) var contentLabels: Set<ContentLabel>
  public var isBrandedContent: Bool

  public init(
    title: String,
    category: ChannelCategory?,
    tags: [String],
    language: LiveLanguage?,
    contentLabels: Set<ContentLabel>,
    isBrandedContent: Bool
  ) {
    self.title = title
    self.category = category
    self.tags = tags
    self.language = language
    self.contentLabels = contentLabels
    self.isBrandedContent = isBrandedContent
  }

  public func adding(tag raw: String) -> StreamInfo? {
    guard let tag = ChannelTag.normalized(raw), !tags.contains(tag), tags.count < ChannelTag.maxCount else {
      return nil
    }
    var info = self
    info.tags.append(tag)
    return info
  }

  public func removing(tag: String) -> StreamInfo {
    var info = self
    info.tags.removeAll { $0 == tag }
    return info
  }

  public func toggling(_ label: ContentLabel) -> StreamInfo {
    var info = self
    if info.contentLabels.contains(label) {
      info.contentLabels.remove(label)
    } else {
      info.contentLabels.insert(label)
    }
    return info
  }
}

public extension LiveLanguage {
  var nativeName: String {
    let own = Locale(identifier: rawValue)
    return own.localizedString(forLanguageCode: rawValue)?.capitalized(with: own) ?? rawValue
  }
}
