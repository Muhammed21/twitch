import SwiftUI

public enum Illustration: String, CaseIterable, Sendable {
  case clapperboard
  case barChart
  case characterOnPurple

  var layers: [IllustrationLayer] {
    tints.map { IllustrationLayer(illustration: self, tint: $0) }
  }

  private var tints: [IllustrationTint] {
    switch self {
    case .clapperboard, .barChart: [.fill, .outline, .ink]
    case .characterOnPurple: [.accent, .fill, .outline, .highlight, .ink]
    }
  }

  var size: CGSize {
    switch self {
    case .clapperboard: CGSize(width: 140, height: 128)
    case .barChart: CGSize(width: 137, height: 138)
    case .characterOnPurple: CGSize(width: 162, height: 178)
    }
  }
}

enum IllustrationTint: String, CaseIterable, Sendable {
  case accent
  case fill
  case outline
  case highlight
  case ink

  var maskSuffix: String {
    rawValue.prefix(1).uppercased() + rawValue.dropFirst()
  }

  var role: ColorRole {
    switch self {
    case .accent: .illustrationAccent
    case .fill: .illustrationFill
    case .outline: .illustrationOutline
    case .highlight: .illustrationHighlight
    case .ink: .illustrationInk
    }
  }
}

struct IllustrationLayer: Equatable, Sendable {
  let illustration: Illustration
  let tint: IllustrationTint

  var mask: String {
    illustration.rawValue + tint.maskSuffix
  }
}

public struct IllustrationImage: View {
  private let illustration: Illustration

  public init(_ illustration: Illustration) {
    self.illustration = illustration
  }

  public var body: some View {
    ZStack {
      ForEach(illustration.layers, id: \.tint) { layer in
        Image(layer.mask, bundle: .module)
          .renderingMode(.template)
          .foregroundStyle(layer.tint.role.color)
      }
    }
    .frame(width: illustration.size.width, height: illustration.size.height)
    .accessibilityHidden(true)
  }
}
