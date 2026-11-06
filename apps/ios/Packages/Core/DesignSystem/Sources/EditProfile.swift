import SwiftUI

public enum EditProfileStyle {
  public static let sectionLabel = ColorRole.textSecondary
  public static let rowTitle = ColorRole.textPrimary
  public static let rowValue = ColorRole.textSecondary
  public static let divider = ColorRole.border
  public static let sectionFooter = ColorRole.textSecondary
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
        .foregroundStyle(ProfileHeaderStyle.onBannerControl.color)
        .padding(.horizontal, LayoutRole.profileEditPadding.points)
        .frame(minHeight: LayoutRole.profileEditHeight.points)
        .background(ProfileHeaderStyle.bannerControl.color, in: Capsule())
        .contentShape(Capsule())
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("profile.edit")
  }
}

struct ProfileSettingsButton: View {
  let settings: ProfileHeaderAction

  var body: some View {
    Button(action: settings.action) {
      Image(systemName: "gearshape")
        .resizable()
        .scaledToFit()
        .frame(width: LayoutRole.profileBannerGlyph.points, height: LayoutRole.profileBannerGlyph.points)
        .foregroundStyle(ProfileHeaderStyle.onBannerControl.color)
        .frame(width: LayoutRole.profileBannerControlSize.points, height: LayoutRole.profileBannerControlSize.points)
        .background(ProfileHeaderStyle.bannerControl.color, in: Circle())
        .contentShape(Circle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(settings.label)
    .accessibilityIdentifier("profile.settings")
  }
}

public struct EditSection<Content: View>: View {
  private let label: String
  private let footer: String?
  private let content: Content

  public init(label: String, footer: String? = nil, @ViewBuilder content: () -> Content) {
    self.label = label
    self.footer = footer
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
        .background(ColorRole.surface.color)
        .clipShape(RoundedRectangle(cornerRadius: LayoutRole.menuCardRadius.points))
      if let footer {
        Text(footer)
          .font(TextRole.editSectionFooter.font)
          .foregroundStyle(EditProfileStyle.sectionFooter.color)
          .padding(.horizontal, LayoutRole.menuRowPadding.points)
      }
    }
  }
}

public enum EditRowAccessory {
  case disclosure
  case edit

  static let disclosureSymbol = "chevron.right"

  var glyph: Glyph? {
    switch self {
    case .disclosure: nil
    case .edit: .editPencil
    }
  }

  var inset: LayoutRole {
    switch self {
    case .disclosure: .menuRowPadding
    case .edit: .editImageRowPadding
    }
  }
}

public struct EditRow: View {
  private let title: String
  private let value: String
  private let accessory: EditRowAccessory

  public init(title: String, value: String, accessory: EditRowAccessory = .disclosure) {
    self.title = title
    self.value = value
    self.accessory = accessory
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
      accessoryImage
        .foregroundStyle(EditProfileStyle.rowValue.color)
        .accessibilityHidden(true)
    }
    .padding(.horizontal, accessory.inset.points)
    .padding(.vertical, LayoutRole.editRowPadding.points)
    .contentShape(Rectangle())
  }

  @ViewBuilder private var accessoryImage: some View {
    if let glyph = accessory.glyph {
      glyph.image
        .frame(width: LayoutRole.editRowIconSize.points, height: LayoutRole.editRowIconSize.points)
    } else {
      Image(systemName: EditRowAccessory.disclosureSymbol)
        .font(TextRole.editRowValue.font)
    }
  }
}
