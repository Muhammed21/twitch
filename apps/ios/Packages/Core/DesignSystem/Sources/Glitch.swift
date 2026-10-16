import SwiftUI

public struct GlitchBubble: Shape {
  public static let pathData =
    "M500,0L0,500v1800h600v500l500-500h400l900-900V0H500z M2200,1300l-400,400h-400l-350,350v-350H600V200h1600 V1300z"

  public init() {}

  public func path(in rect: CGRect) -> Path {
    Path(svgPathData: Self.pathData).applying(GlitchViewBox.fitting(rect))
  }
}

public struct GlitchEyes: Shape {
  public static let viewBoxRects = [
    CGRect(x: 1700, y: 550, width: 200, height: 600),
    CGRect(x: 1150, y: 550, width: 200, height: 600),
  ]

  public static let blinkAnchor = UnitPoint(
    x: 0.5,
    y: (viewBoxRects[0].midY) / GlitchViewBox.size.height
  )

  public init() {}

  public func path(in rect: CGRect) -> Path {
    Path { path in path.addRects(Self.viewBoxRects) }.applying(GlitchViewBox.fitting(rect))
  }
}

enum GlitchViewBox {
  static let size = CGSize(width: 2400, height: 2800)

  static func fitting(_ rect: CGRect) -> CGAffineTransform {
    let scale = min(rect.width / size.width, rect.height / size.height)
    return CGAffineTransform(
      a: scale,
      b: 0,
      c: 0,
      d: scale,
      tx: rect.midX - size.width * scale / 2,
      ty: rect.midY - size.height * scale / 2
    )
  }
}

private enum SVGToken {
  case command(Character)
  case number(CGFloat)
}

private func tokens(of data: String) -> [SVGToken] {
  data.reduce(into: (tokens: [SVGToken](), pending: "")) { state, character in
    let flushed: [SVGToken] = Double(state.pending).map { [.number(CGFloat($0))] } ?? []
    switch character {
    case _ where character.isLetter:
      state = (state.tokens + flushed + [.command(character)], "")
    case "-" where !state.pending.isEmpty:
      state = (state.tokens + flushed, "-")
    case _ where character.isNumber || character == "." || character == "-":
      state.pending.append(character)
    default:
      state = (state.tokens + flushed, "")
    }
  }
  .tokens
}

private struct SVGPen {
  let path: Path
  let current: CGPoint
  let command: Character
  let arguments: [CGFloat]

  static let empty = SVGPen(path: Path(), current: .zero, command: "M", arguments: [])

  func moved(to point: CGPoint, drawing: Bool) -> SVGPen {
    var next = path
    if drawing { next.addLine(to: point) } else { next.move(to: point) }
    return SVGPen(
      path: next,
      current: point,
      command: command,
      arguments: []
    )
  }

  func consuming(_ number: CGFloat) -> SVGPen {
    let arguments = arguments + [number]
    let relative = command.isLowercase
    let origin = relative ? current : .zero
    switch command.uppercased() {
    case "M" where arguments.count == 2, "L" where arguments.count == 2:
      return moved(
        to: CGPoint(x: origin.x + arguments[0], y: origin.y + arguments[1]),
        drawing: command.uppercased() == "L"
      )
    case "H":
      return moved(to: CGPoint(x: origin.x + number, y: current.y), drawing: true)
    case "V":
      return moved(to: CGPoint(x: current.x, y: origin.y + number), drawing: true)
    default:
      return SVGPen(path: path, current: current, command: command, arguments: arguments)
    }
  }

  func closed() -> SVGPen {
    var next = path
    next.closeSubpath()
    return SVGPen(path: next, current: current, command: "M", arguments: [])
  }
}

extension Path {
  init(svgPathData data: String) {
    self = tokens(of: data).reduce(SVGPen.empty) { pen, token in
      switch token {
      case let .command(command) where command == "z" || command == "Z":
        pen.closed()
      case let .command(command):
        SVGPen(path: pen.path, current: pen.current, command: command, arguments: [])
      case let .number(number):
        pen.consuming(number)
      }
    }
    .path
  }
}
