import SwiftUI

public enum WidgetStyle {
  public static let header = ColorRole.surfaceSecondary
  public static let body = ColorRole.surface
  public static let preview = ColorRole.mediaBackground
  public static let dockButton = ColorRole.surfaceSecondary
  public static let dockRing = ColorRole.textPrimary
}

public struct WidgetCard<Content: View>: View {
  private let title: String
  private let content: Content

  public init(title: String, @ViewBuilder content: () -> Content) {
    self.title = title
    self.content = content()
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(verbatim: title)
        .textCase(.uppercase)
        .font(TextRole.widgetTitle.font)
        .foregroundStyle(ColorRole.textPrimary.color)
        .padding(.horizontal, LayoutRole.widgetHeaderPadding.points)
        .frame(maxWidth: .infinity, minHeight: LayoutRole.widgetHeaderHeight.points, alignment: .leading)
        .background(WidgetStyle.header.color)
        .accessibilityAddTraits(.isHeader)
      ScrollView {
        content
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .frame(maxHeight: .infinity)
      .background(WidgetStyle.body.color)
    }
    .clipShape(RoundedRectangle(cornerRadius: LayoutRole.widgetRadius.points))
  }
}

public struct StreamPreview: View {
  public init() {}

  public var body: some View {
    RoundedRectangle(cornerRadius: LayoutRole.widgetRadius.points)
      .fill(WidgetStyle.preview.color)
      .aspectRatio(16 / 9, contentMode: .fit)
      .accessibilityHidden(true)
  }
}

public struct WidgetDockItem<Widget: Hashable>: Identifiable {
  public let widget: Widget
  public let label: String
  public let systemImage: String
  public let accessibilityIdentifier: String

  public var id: Widget { widget }

  public init(widget: Widget, label: String, systemImage: String, accessibilityIdentifier: String) {
    self.widget = widget
    self.label = label
    self.systemImage = systemImage
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
          DockButton(systemImage: item.systemImage, isSelected: item.widget == selection)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.label)
        .accessibilityAddTraits(item.widget == selection ? .isSelected : [])
        .accessibilityIdentifier(item.accessibilityIdentifier)
      }
    }
    .frame(maxWidth: .infinity)
  }
}

private struct DockButton: View {
  let systemImage: String
  let isSelected: Bool

  private var ringInset: CGFloat { LayoutRole.dockRingWidth.points + LayoutRole.dockRingGap.points }

  var body: some View {
    RoundedRectangle(cornerRadius: LayoutRole.widgetRadius.points)
      .fill(WidgetStyle.dockButton.color)
      .overlay {
        Image(systemName: systemImage)
          .foregroundStyle(ColorRole.textPrimary.color)
      }
      .padding(isSelected ? ringInset : 0)
      .overlay {
        if isSelected {
          RoundedRectangle(cornerRadius: LayoutRole.widgetRadius.points)
            .strokeBorder(WidgetStyle.dockRing.color, lineWidth: LayoutRole.dockRingWidth.points)
        }
      }
      .frame(width: LayoutRole.dockButtonSize.points, height: LayoutRole.dockButtonSize.points)
  }
}
