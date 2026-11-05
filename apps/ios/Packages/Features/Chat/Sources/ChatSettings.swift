import DesignSystem
import SwiftUI

public enum ChatSettingsText {
  public static var title: String { ChatText.localized("chat.settings.title") }
  public static var close: String { ChatText.localized("chat.settings.close") }
  public static var identity: String { ChatText.localized("chat.settings.identity") }
  public static var colorTitle: String { ChatText.localized("chat.color.title") }
  public static var defaultColor: String { ChatText.localized("chat.color.default") }
  public static var colorFailed: String { ChatText.localized("chat.color.failed") }

  public static func name(of color: ChatNameColor) -> String {
    switch color {
    case .blue: ChatText.localized("chat.color.blue")
    case .green: ChatText.localized("chat.color.green")
    case .purple: ChatText.localized("chat.color.purple")
    case .red: ChatText.localized("chat.color.red")
    case .maroon: ChatText.localized("chat.color.maroon")
    case .teal: ChatText.localized("chat.color.teal")
    case .indigo: ChatText.localized("chat.color.indigo")
    }
  }
}

public struct ChatSettingsSheet: View {
  private let username: String
  private let colors: ChatColorStore?
  private let onClose: () -> Void

  public init(username: String, colors: ChatColorStore?, onClose: @escaping () -> Void) {
    self.username = username
    self.colors = colors
    self.onClose = onClose
  }

  public var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: LayoutRole.dialogActionGap.points) {
        header
        Text(ChatSettingsText.identity)
          .font(TextRole.editSectionLabel.font)
          .foregroundStyle(ColorRole.textSecondary.color)
        identityRow
        Spacer(minLength: 0)
      }
      .padding(LayoutRole.screenInset.points)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(ColorRole.surfaceTertiary.color.ignoresSafeArea())
      .toolbar(.hidden, for: .navigationBar)
    }
  }

  private var header: some View {
    HStack {
      Text(ChatSettingsText.title)
        .font(TextRole.dialogTitle.font)
        .foregroundStyle(ColorRole.textPrimary.color)
        .accessibilityAddTraits(.isHeader)
      Spacer()
      Button(action: onClose) {
        Image(systemName: "xmark")
          .foregroundStyle(ColorRole.textPrimary.color)
      }
      .accessibilityLabel(ChatSettingsText.close)
      .accessibilityIdentifier("chat.settings.close")
    }
  }

  @ViewBuilder private var identityRow: some View {
    if let colors {
      NavigationLink { ChatColorPicker(store: colors) } label: { identityLabel(color: colors.selected) }
        .accessibilityIdentifier("chat.settings.identity")
    } else {
      identityLabel(color: nil)
    }
  }

  private func identityLabel(color: ChatNameColor?) -> some View {
    HStack {
      Text(verbatim: username)
        .font(TextRole.editRowValue.font)
        .foregroundStyle(color?.color ?? ColorRole.textPrimary.color)
      Spacer()
      Glyph.avatarPerson.image
        .resizable()
        .scaledToFit()
        .frame(width: LayoutRole.editRowIconSize.points, height: LayoutRole.editRowIconSize.points)
        .foregroundStyle(ColorRole.textPrimary.color)
    }
    .padding(LayoutRole.editRowPadding.points)
    .background(ColorRole.surface.color, in: RoundedRectangle(cornerRadius: LayoutRole.menuCardRadius.points))
  }
}

struct ChatColorPicker: View {
  let store: ChatColorStore

  var body: some View {
    List {
      option(nil, name: ChatSettingsText.defaultColor)
      ForEach(ChatNameColor.allCases, id: \.self) { color in
        option(color, name: ChatSettingsText.name(of: color))
      }
      if store.hasFailed {
        Text(ChatSettingsText.colorFailed)
          .font(TextRole.body.font)
          .foregroundStyle(ColorRole.danger.color)
          .accessibilityIdentifier("chat.color.failed")
      }
    }
    .disabled(store.isSaving)
    .navigationTitle(ChatSettingsText.colorTitle)
    .navigationBarTitleDisplayMode(.inline)
  }

  @ViewBuilder private func swatch(_ color: ChatNameColor?) -> some View {
    if let color {
      Circle().fill(color.color)
    } else {
      Circle().strokeBorder(ColorRole.textSecondary.color, lineWidth: LayoutRole.chatUnreadLineWidth.points)
    }
  }

  private func option(_ color: ChatNameColor?, name: String) -> some View {
    Button { Task { await store.choose(color) } } label: {
      HStack(spacing: LayoutRole.menuLabelGap.points) {
        swatch(color)
          .frame(width: LayoutRole.editRowIconSize.points, height: LayoutRole.editRowIconSize.points)
        Text(name)
          .font(TextRole.editRowValue.font)
          .foregroundStyle(color?.color ?? ColorRole.textPrimary.color)
        Spacer()
        if store.selected == color {
          Image(systemName: "checkmark")
            .foregroundStyle(ColorRole.accent.color)
        }
      }
    }
    .accessibilityIdentifier("chat.color.\(color?.rawValue ?? "default")")
    .accessibilityAddTraits(store.selected == color ? .isSelected : [])
  }
}
