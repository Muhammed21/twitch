import DesignTokens
import SwiftUI

public enum CategoryPickerStyle {
  public static let cardBackground = ColorRole.surfaceTertiary
  public static let cardBorder = ColorRole.border
  public static let coverPlaceholder = ColorRole.surfaceSecondary
  public static let searchField = ColorRole.surfaceSecondary
  public static let name = ColorRole.textPrimary
  public static let hint = ColorRole.textSecondary

  public static func coverHeight(forWidth width: CGFloat) -> CGFloat {
    width * Spacing.x4 / Spacing.x3
  }
}

public struct CategoryCover: View {
  private let width: CGFloat

  public init(width: CGFloat) {
    self.width = width
  }

  public var body: some View {
    CategoryPickerStyle.coverPlaceholder.color
      .frame(width: width, height: CategoryPickerStyle.coverHeight(forWidth: width))
      .accessibilityHidden(true)
  }
}

public struct CategoryCard: View {
  private let name: String
  private let clearLabel: String
  private let onClear: () -> Void

  public init(name: String, clearLabel: String, onClear: @escaping () -> Void) {
    self.name = name
    self.clearLabel = clearLabel
    self.onClear = onClear
  }

  public var body: some View {
    HStack(alignment: .top, spacing: LayoutRole.categoryCardTextGap.points) {
      CategoryCover(width: LayoutRole.categoryCardCoverWidth.points)
      Text(name)
        .font(TextRole.categoryName.font)
        .foregroundStyle(CategoryPickerStyle.name.color)
        .padding(.top, LayoutRole.categoryCardTextGap.points)
        .frame(maxWidth: .infinity, alignment: .leading)
      Button(action: onClear) {
        Image(systemName: "xmark")
          .font(TextRole.display.font)
          .foregroundStyle(CategoryPickerStyle.name.color)
      }
      .accessibilityLabel(clearLabel)
      .padding(LayoutRole.categoryCardTextGap.points)
    }
    .background(CategoryPickerStyle.cardBackground.color)
    .clipShape(RoundedRectangle(cornerRadius: LayoutRole.categoryCardRadius.points))
    .overlay(
      RoundedRectangle(cornerRadius: LayoutRole.categoryCardRadius.points)
        .strokeBorder(CategoryPickerStyle.cardBorder.color, lineWidth: LayoutRole.categoryCardBorderWidth.points)
    )
  }
}

public struct CategoryResultRow: View {
  private let name: String

  public init(name: String) {
    self.name = name
  }

  public var body: some View {
    HStack(alignment: .top, spacing: LayoutRole.categoryResultTextGap.points) {
      CategoryCover(width: LayoutRole.categoryResultCoverWidth.points)
      Text(name)
        .font(TextRole.categoryName.font)
        .foregroundStyle(CategoryPickerStyle.name.color)
        .padding(.top, LayoutRole.categoryCardTextGap.points)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .contentShape(Rectangle())
  }
}
