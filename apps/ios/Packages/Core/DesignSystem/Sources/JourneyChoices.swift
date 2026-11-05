import SwiftUI

public struct JourneyChoiceCard<Content: View>: View {
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    VStack(spacing: 0) { content }
      .background(JourneyStyle.card.color)
      .clipShape(RoundedRectangle(cornerRadius: LayoutRole.menuCardRadius.points))
  }
}

public struct JourneyChoiceDivider: View {
  public init() {}

  public var body: some View {
    JourneyStyle.choiceDivider.color
      .frame(height: LayoutRole.categoryCardBorderWidth.points)
      .padding(.leading, LayoutRole.menuRowPadding.points)
  }
}

public struct CategoryChoiceRow: View {
  private let name: String
  private let detail: String?
  private let coverURL: URL?
  private let isSelected: Bool
  private let isPending: Bool

  public init(name: String, detail: String?, coverURL: URL?, isSelected: Bool, isPending: Bool) {
    self.name = name
    self.detail = detail
    self.coverURL = coverURL
    self.isSelected = isSelected
    self.isPending = isPending
  }

  public static func symbol(isSelected: Bool) -> String {
    isSelected ? "checkmark.circle.fill" : "plus.circle"
  }

  public var body: some View {
    HStack(spacing: LayoutRole.journeyChoicePadding.points) {
      CategoryCover(width: LayoutRole.journeyChoiceCoverWidth.points, url: coverURL)
      VStack(alignment: .leading, spacing: 0) {
        Text(name)
          .font(TextRole.journeyChoiceName.font)
          .foregroundStyle(JourneyStyle.choiceName.color)
        if let detail {
          Text(detail)
            .font(TextRole.journeyChoiceDetail.font)
            .foregroundStyle(JourneyStyle.choiceDetail.color)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      indicator
        .frame(width: LayoutRole.journeyControlSize.points, height: LayoutRole.journeyControlSize.points)
        .padding(.trailing, LayoutRole.menuRowPadding.points - LayoutRole.journeyChoicePadding.points)
    }
    .padding(LayoutRole.journeyChoicePadding.points)
    .contentShape(Rectangle())
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
  }

  @ViewBuilder private var indicator: some View {
    if isPending {
      ProgressView()
    } else {
      Image(systemName: Self.symbol(isSelected: isSelected))
        .font(TextRole.display.font)
        .foregroundStyle((isSelected ? JourneyStyle.selected : JourneyStyle.unselected).color)
        .contentTransition(.symbolEffect(.replace))
        .accessibilityHidden(true)
    }
  }
}

public struct InterestChip: View {
  private let name: String
  private let isSelected: Bool

  public init(name: String, isSelected: Bool) {
    self.name = name
    self.isSelected = isSelected
  }

  public var body: some View {
    HStack(spacing: LayoutRole.journeyChipPaddingV.points) {
      if isSelected {
        Image(systemName: "checkmark")
          .accessibilityHidden(true)
          .transition(.scale.combined(with: .opacity))
      }
      Text(name)
    }
    .font(TextRole.journeyChoiceName.font)
    .foregroundStyle((isSelected ? JourneyStyle.chipSelectedLabel : JourneyStyle.chipLabel).color)
    .padding(.horizontal, LayoutRole.journeyChipPaddingH.points)
    .padding(.vertical, LayoutRole.journeyChipPaddingV.points)
    .background(Capsule().fill((isSelected ? JourneyStyle.chipSelected : JourneyStyle.chip).color))
    .contentShape(Capsule())
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
  }
}

public struct JourneyFlow: Layout {
  private let spacing: CGFloat

  public init(spacing: CGFloat = LayoutRole.journeyChipGap.points) {
    self.spacing = spacing
  }

  public static func frames(of sizes: [CGSize], width: CGFloat, spacing: CGFloat) -> [CGRect] {
    sizes.reduce(into: (frames: [CGRect](), x: CGFloat.zero, y: CGFloat.zero, rowHeight: CGFloat.zero)) { state, size in
      let wraps = state.x > 0 && state.x + size.width > width
      let x = wraps ? 0 : state.x
      let y = wraps ? state.y + state.rowHeight + spacing : state.y
      let rowHeight = wraps ? size.height : max(state.rowHeight, size.height)
      state = (state.frames + [CGRect(origin: CGPoint(x: x, y: y), size: size)], x + size.width + spacing, y, rowHeight)
    }
    .frames
  }

  public static func size(of sizes: [CGSize], width: CGFloat, spacing: CGFloat) -> CGSize {
    CGSize(width: width, height: frames(of: sizes, width: width, spacing: spacing).map(\.maxY).max() ?? 0)
  }

  public func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache _: inout ()) -> CGSize {
    let width = proposal.replacingUnspecifiedDimensions().width
    return Self.size(of: subviews.map { $0.sizeThatFits(.unspecified) }, width: width, spacing: spacing)
  }

  public func placeSubviews(in bounds: CGRect, proposal _: ProposedViewSize, subviews: Subviews, cache _: inout ()) {
    let frames = Self.frames(of: subviews.map { $0.sizeThatFits(.unspecified) }, width: bounds.width, spacing: spacing)
    for (subview, frame) in zip(subviews, frames) {
      subview.place(at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY), proposal: ProposedViewSize(frame.size))
    }
  }
}
