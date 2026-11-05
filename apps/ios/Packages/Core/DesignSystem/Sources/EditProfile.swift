import SwiftUI

public enum EditProfileStyle {
  public static let editButton = ColorRole.onMedia
  public static let sectionLabel = ColorRole.textSecondary
  public static let rowTitle = ColorRole.textPrimary
  public static let rowValue = ColorRole.textSecondary
  public static let divider = ColorRole.border
}

public struct ProfileHeaderAction {
  public let label: String
  public let action: () -> Void

  public init(label: String, action: @escaping () -> Void) {
    self.label = label
    self.action = action
  }
}

struct ProfileEditButton: View {
  let edit: ProfileHeaderAction

  var body: some View {
    Button(action: edit.action) {
      Text(edit.label)
        .font(TextRole.profileEdit.font)
        .foregroundStyle(EditProfileStyle.editButton.color)
    }
    .buttonStyle(.plain)
    .padding(.top, LayoutRole.profileEditTop.points)
    .padding(.trailing, LayoutRole.profileEditTrailing.points)
    .accessibilityIdentifier("profile.edit")
  }
}

public struct EditSection<Content: View>: View {
  private let label: String
  private let content: Content

  public init(label: String, @ViewBuilder content: () -> Content) {
    self.label = label
    self.content = content()
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: LayoutRole.editSectionLabelGap.points) {
      Text(label)
        .textCase(.uppercase)
        .font(TextRole.editSectionLabel.font)
        .foregroundStyle(EditProfileStyle.sectionLabel.color)
        .accessibilityAddTraits(.isHeader)
      VStack(spacing: 0) { content }
        .background(ColorRole.surface.color, in: RoundedRectangle(cornerRadius: LayoutRole.menuCardRadius.points))
    }
  }
}

public struct EditRow: View {
  private let title: String
  private let value: String

  public init(title: String, value: String) {
    self.title = title
    self.value = value
  }

  public var body: some View {
    HStack(spacing: LayoutRole.menuRowPadding.points) {
      VStack(alignment: .leading, spacing: LayoutRole.editRowLineGap.points) {
        Text(title)
          .font(TextRole.editRowTitle.font)
          .foregroundStyle(EditProfileStyle.rowTitle.color)
        Text(value)
          .font(TextRole.editRowValue.font)
          .foregroundStyle(EditProfileStyle.rowValue.color)
          .lineLimit(2)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Image(systemName: "chevron.right")
        .font(TextRole.editRowValue.font)
        .foregroundStyle(EditProfileStyle.rowValue.color)
        .accessibilityHidden(true)
    }
    .padding(.horizontal, LayoutRole.menuRowPadding.points)
    .padding(.vertical, LayoutRole.editRowPadding.points)
    .contentShape(Rectangle())
  }
}
