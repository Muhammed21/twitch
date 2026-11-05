import SwiftUI

public enum Illustration: String, CaseIterable, Sendable {
  case clapperboard
  case barChart

  var layers: [IllustrationLayer] {
    IllustrationTint.allCases.map { IllustrationLayer(illustration: self, tint: $0) }
  }

  var size: CGSize {
    switch self {
    case .clapperboard: CGSize(width: 140, height: 128)
    case .barChart: CGSize(width: 137, height: 138)
    }
  }
}

enum IllustrationTint: String, CaseIterable, Sendable {
  case fill
  case outline
  case ink

  var maskSuffix: String {
    switch self {
    case .fill: "Fill"
    case .outline: "Outline"
    case .ink: "Ink"
    }
  }

  var role: ColorRole {
    switch self {
    case .fill: .illustrationFill
    case .outline: .illustrationOutline
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
