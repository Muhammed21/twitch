import SwiftUI

public enum WidgetStyle {
  public static let header = ColorRole.widgetHeader
  public static let body = ColorRole.surface
  public static let border = ColorRole.widgetBorder
  public static let menuGlyph = Glyph.widgetMenu
  public static let chatGlyph = Glyph.widgetChat
  public static let dockButton = ColorRole.surfaceTertiary
  public static let dockRing = ColorRole.textPrimary
}

public struct WidgetCard<Content: View>: View {
  private let title: String
  private let menuLabel: String
  private let content: Content

  public init(title: String, menuLabel: String, @ViewBuilder content: () -> Content) {
    self.title = title
    self.menuLabel = menuLabel
    self.content = content()
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 0) {
        Text(verbatim: title)
          .textCase(.uppercase)
          .font(TextRole.widgetTitle.font)
          .foregroundStyle(ColorRole.textPrimary.color)
          .accessibilityAddTraits(.isHeader)
        Spacer(minLength: 0)
        WidgetStyle.menuGlyph.image
          .foregroundStyle(ColorRole.textPrimary.color)
          .accessibilityRepresentation {
            Button(menuLabel) {}
              .disabled(true)
          }
      }
      .padding(.horizontal, LayoutRole.widgetHeaderPadding.points)
      .frame(height: LayoutRole.widgetHeaderHeight.points)
      .background(WidgetStyle.header.color)
      content
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(WidgetStyle.body.color)
    }
    .clipShape(RoundedRectangle(cornerRadius: LayoutRole.widgetRadius.points))
    .overlay {
      RoundedRectangle(cornerRadius: LayoutRole.widgetRadius.points)
        .strokeBorder(WidgetStyle.border.color, lineWidth: LayoutRole.widgetBorderWidth.points)
    }
  }
}

public enum WidgetDockIcon: Equatable, Sendable {
  case glyph(Glyph)
  case system(String)
}

public struct WidgetDockItem<Widget: Hashable>: Identifiable {
  public let widget: Widget
  public let label: String
  public let icon: WidgetDockIcon
  public let accessibilityIdentifier: String

  public var id: Widget { widget }

  public init(widget: Widget, label: String, icon: WidgetDockIcon, accessibilityIdentifier: String) {
    self.widget = widget
    self.label = label
    self.icon = icon
    self.accessibilityIdentifier = accessibilityIdentifier
  }
}

public struct WidgetDock<Widget: Hashable>: View {
  @Binding private var selection: Widget
  private let items: [WidgetDockItem<Widget>]

  public init(selection: Binding<Widget>, items: [WidgetDockItem<Widget>]) {
    _selection = selection
    self.items = items
  }

  public var body: some View {
    HStack(spacing: LayoutRole.dockGap.points) {
      ForEach(items) { item in
        Button { selection = item.widget } label: {
          DockButton(icon: item.icon, isSelected: item.widget == selection)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.label)
        .accessibilityAddTraits(item.widget == selection ? .isSelected : [])
        .accessibilityIdentifier(item.accessibilityIdentifier)
      }
    }
    .padding(.horizontal, LayoutRole.dockInset.points)
    .padding(.top, LayoutRole.dockTop.points)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct DockButton: View {
  let icon: WidgetDockIcon
  let isSelected: Bool

  private var ringInset: CGFloat { LayoutRole.dockRingWidth.points + LayoutRole.dockRingGap.points }

  var body: some View {
    Capsule()
      .fill(WidgetStyle.dockButton.color)
      .overlay { image.foregroundStyle(ColorRole.textPrimary.color) }
      .frame(width: LayoutRole.dockButtonWidth.points, height: LayoutRole.dockButtonHeight.points)
      .padding(ringInset)
      .overlay {
        if isSelected {
          Capsule().strokeBorder(WidgetStyle.dockRing.color, lineWidth: LayoutRole.dockRingWidth.points)
        }
      }
  }

  @ViewBuilder private var image: some View {
    switch icon {
    case let .glyph(glyph): glyph.image
    case let .system(name): Image(systemName: name)
    }
  }
}

public enum StreamManagerStyle {
  public static let background = ColorRole.surface
  public static let closeGlyph = Glyph.closeCross
  public static let cameraGlyph = Glyph.streamCamera
  public static let camera = ColorRole.streamManagerCamera
  public static let offlineBadge = ColorRole.mediaBackground
  public static let offlineLabel = ColorRole.onMedia
  public static let divider = ColorRole.streamManagerDivider
}

public struct StreamManagerHeader: View {
  @Environment(\.displayScale) private var displayScale
  private let title: String
  private let offlineLabel: String?
  private let closeLabel: String
  private let onClose: () -> Void

  public init(title: String, offlineLabel: String?, closeLabel: String, onClose: @escaping () -> Void) {
    self.title = title
    self.offlineLabel = offlineLabel
    self.closeLabel = closeLabel
    self.onClose = onClose
  }

  public var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 0) {
        Button(action: onClose) {
          StreamManagerStyle.closeGlyph.image
            .foregroundStyle(ColorRole.textPrimary.color)
            .frame(width: LayoutRole.dashboardIconTarget.points, height: LayoutRole.dashboardIconTarget.points)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(closeLabel)
        .accessibilityIdentifier("streamManager.close")
        StreamManagerStyle.cameraGlyph.image
          .foregroundStyle(StreamManagerStyle.camera.color)
          .accessibilityHidden(true)
        Text(verbatim: title)
          .font(TextRole.streamManagerTitle.font)
          .foregroundStyle(ColorRole.textPrimary.color)
          .lineLimit(1)
          .accessibilityAddTraits(.isHeader)
          .padding(.leading, LayoutRole.streamManagerTitleGap.points)
        Spacer(minLength: LayoutRole.streamManagerItemGap.points)
        if let offlineLabel {
          Text(verbatim: offlineLabel)
            .font(TextRole.liveBadge.font)
            .foregroundStyle(StreamManagerStyle.offlineLabel.color)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, LayoutRole.liveBadgePadding.points)
            .frame(minHeight: LayoutRole.liveBadgeHeight.points)
            .background(
              StreamManagerStyle.offlineBadge.color,
              in: RoundedRectangle(cornerRadius: LayoutRole.liveBadgeRadius.points)
            )
            .padding(.trailing, LayoutRole.streamManagerItemGap.points)
            .accessibilityIdentifier("streamManager.offline")
        }
        DefaultAvatar(
          diameter: LayoutRole.streamManagerAvatarSize.points,
          glyphInset: LayoutRole.avatarGlyphInset.points
        )
      }
      .padding(.horizontal, LayoutRole.screenInset.points)
      .frame(height: LayoutRole.streamManagerHeaderHeight.points)
      .padding(.bottom, LayoutRole.streamManagerHeaderBottom.points)
      Rectangle()
        .fill(StreamManagerStyle.divider.color)
        .frame(height: 1 / displayScale)
    }
  }
}

public enum WidgetChatFieldStyle {
  public static let background = ColorRole.surface
  public static let border = ColorRole.widgetFieldBorder
  public static let emoteGlyph = Glyph.emote
}
