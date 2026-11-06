import DesignTokens
import SwiftUI

public enum TapTarget {
  public static let minimum = Spacing.x44

  public static func outset(forVisible size: CGFloat) -> CGFloat {
    max(0, (minimum - size) / 2)
  }
}

public enum ReadableLines {
  public static func limit(_ lines: Int, at size: DynamicTypeSize) -> Int? {
    size.isAccessibilitySize ? nil : lines
  }
}

public struct AccessibleAction {
  public let name: String
  public let perform: () -> Void

  public init(name: String, perform: @escaping () -> Void) {
    self.name = name
    self.perform = perform
  }
}

public struct AccessibleCard {
  public let label: String
  public let hint: String?
  public let traits: AccessibilityTraits
  public let actions: [AccessibleAction]

  public init(parts: [String?], hint: String? = nil, isSelected: Bool = false, actions: [AccessibleAction] = []) {
    label = parts.compactMap(Self.spoken).joined(separator: ", ")
    self.hint = hint.flatMap(Self.spoken)
    traits = isSelected ? [.isButton, .isSelected] : .isButton
    self.actions = actions
  }

  private static func spoken(_ text: String?) -> String? {
    guard let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
    return text
  }
}

public extension View {
  func accessibleCard(_ card: AccessibleCard) -> some View {
    modifier(AccessibleCardModifier(card: card))
  }

  func minimumTapTarget() -> some View {
    frame(minWidth: TapTarget.minimum, minHeight: TapTarget.minimum)
      .contentShape(Rectangle())
  }

  func expandedTapTarget(visibleHeight: CGFloat) -> some View {
    contentShape(Rectangle().inset(by: -TapTarget.outset(forVisible: visibleHeight)))
  }

  func readableLineLimit(_ lines: Int) -> some View {
    modifier(ReadableLineLimit(lines: lines))
  }
}

private struct ReadableLineLimit: ViewModifier {
  @Environment(\.dynamicTypeSize) private var size
  let lines: Int

  func body(content: Content) -> some View {
    content.lineLimit(ReadableLines.limit(lines, at: size))
  }
}

private struct AccessibleCardModifier: ViewModifier {
  let card: AccessibleCard

  func body(content: Content) -> some View {
    content
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(verbatim: card.label))
      .accessibilityHint(card.hint.map { Text(verbatim: $0) } ?? Text(verbatim: ""))
      .accessibilityAddTraits(card.traits)
      .accessibilityActions {
        ForEach(Array(card.actions.enumerated()), id: \.offset) { _, action in
          Button(action.name, action: action.perform)
        }
      }
  }
}
