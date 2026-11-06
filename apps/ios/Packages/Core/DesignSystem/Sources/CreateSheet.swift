import SwiftUI

public enum CreateSheetStyle {
  public static let background = ColorRole.background
  public static let heroBackground = ColorRole.accent
  public static let heroForeground = ColorRole.onAccent
  public static let heroGlyph = Glyph.broadcast
  public static let rowBackground = ColorRole.surface
  public static let rowForeground = ColorRole.textPrimary
  public static let leaveGlyph = Glyph.leaveDashboard
  public static let titleMinimumScale = 0.85

  public static func opacity(isEnabled: Bool) -> Double {
    isEnabled ? 1 : 0.5
  }
}

public struct CreateSheet<Content: View>: View {
  @State private var height: CGFloat = 0
  private let content: Content

  public init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  public var body: some View {
    VStack(spacing: LayoutRole.sheetCardGap.points) {
      content
    }
    .padding(LayoutRole.sheetInset.points)
    .fixedSize(horizontal: false, vertical: true)
    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
    .frame(maxHeight: .infinity, alignment: .top)
    .presentationDetents(height > 0 ? [.height(height)] : [.medium])
    .presentationDragIndicator(.hidden)
    .presentationCornerRadius(LayoutRole.sheetRadius.points)
    .presentationBackground(CreateSheetStyle.background.color)
  }
}

public struct CreateSheetHero: View {
  private let title: String
  private let detail: String
  private let action: () -> Void

  public init(title: String, detail: String, action: @escaping () -> Void) {
    self.title = title
    self.detail = detail
    self.action = action
  }

  public var body: some View {
    Button(action: action) {
      VStack(spacing: LayoutRole.sheetHeroLineGap.points) {
        HStack(spacing: LayoutRole.sheetHeroGlyphGap.points) {
          CreateSheetStyle.heroGlyph.image
            .accessibilityHidden(true)
          Text(verbatim: title)
            .font(TextRole.sheetHero.font)
        }
        Text(verbatim: detail)
          .font(TextRole.sheetHeroDetail.font)
      }
      .multilineTextAlignment(.center)
      .foregroundStyle(CreateSheetStyle.heroForeground.color)
      .padding(.vertical, LayoutRole.sheetHeroPadding.points)
      .frame(maxWidth: .infinity)
      .background(
        CreateSheetStyle.heroBackground.color,
        in: RoundedRectangle(cornerRadius: LayoutRole.sheetCardRadius.points)
      )
      .contentShape(Rectangle())
    }
    .buttonStyle(SheetCardButtonStyle())
  }
}

public struct CreateSheetRow: View {
  private let title: String
  private let detail: String
  private let glyph: Glyph?
  private let isEnabled: Bool
  private let action: () -> Void

  public init(title: String, detail: String, glyph: Glyph? = nil, isEnabled: Bool = true, action: @escaping () -> Void) {
    self.title = title
    self.detail = detail
    self.glyph = glyph
    self.isEnabled = isEnabled
    self.action = action
  }

  public var body: some View {
    Button(action: action) {
      VStack(spacing: LayoutRole.sheetRowLineGap.points) {
        HStack(spacing: LayoutRole.sheetRowGlyphGap.points) {
          if let glyph {
            glyph.image
              .accessibilityHidden(true)
          }
          Text(verbatim: title)
            .font(TextRole.sheetRowTitle.font)
            .readableLineLimit(1)
            .minimumScaleFactor(CreateSheetStyle.titleMinimumScale)
        }
        Text(verbatim: detail)
          .font(TextRole.sheetRowDetail.font)
      }
      .multilineTextAlignment(.center)
      .foregroundStyle(CreateSheetStyle.rowForeground.color)
      .padding(LayoutRole.sheetRowPadding.points)
      .frame(maxWidth: .infinity)
      .background(
        CreateSheetStyle.rowBackground.color,
        in: RoundedRectangle(cornerRadius: LayoutRole.sheetCardRadius.points)
      )
      .opacity(CreateSheetStyle.opacity(isEnabled: isEnabled))
      .contentShape(Rectangle())
    }
    .buttonStyle(SheetCardButtonStyle())
    .disabled(!isEnabled)
  }
}

public struct CreateSheetCancel: View {
  private let label: String
  private let action: () -> Void

  public init(label: String, action: @escaping () -> Void) {
    self.label = label
    self.action = action
  }

  public var body: some View {
    Button(action: action) {
      Text(verbatim: label)
        .font(TextRole.sheetCancel.font)
        .foregroundStyle(CreateSheetStyle.rowForeground.color)
        .frame(maxWidth: .infinity, minHeight: LayoutRole.sheetCancelHeight.points)
        .background(
          CreateSheetStyle.rowBackground.color,
          in: RoundedRectangle(cornerRadius: LayoutRole.sheetCardRadius.points)
        )
        .contentShape(Rectangle())
    }
    .buttonStyle(SheetCardButtonStyle())
  }
}

public enum ModeTransitionStyle {
  public static let background = ColorRole.background
  public static let glitch = ColorRole.textPrimary
}

public struct ModeTransitionScreen: View {
  private let title: String

  public init(title: String) {
    self.title = title
  }

  public var body: some View {
    VStack(spacing: LayoutRole.transitionTitleGap.points) {
      ZStack {
        GlitchBubble()
          .fill(ModeTransitionStyle.glitch.color, style: FillStyle(eoFill: true))
        GlitchEyes()
          .fill(ModeTransitionStyle.glitch.color)
      }
      .frame(width: LayoutRole.transitionGlitchHeight.points, height: LayoutRole.transitionGlitchHeight.points)
      .accessibilityHidden(true)
      Text(verbatim: title)
        .font(TextRole.transitionTitle.font)
        .foregroundStyle(ColorRole.textPrimary.color)
        .multilineTextAlignment(.center)
    }
    .padding(.horizontal, LayoutRole.screenInset.points)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(ModeTransitionStyle.background.color.ignoresSafeArea())
  }
}

private struct SheetCardButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
  }
}
