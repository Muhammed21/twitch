import DesignTokens
import SwiftUI

public enum TextRole: Sendable {
  case hero
  case actionLabel
  case dialogTitle
  case dialogMessage
  case display
  case body
  case chatMessage
  case chatAuthor
  case chatMessageSmall
  case chatAuthorSmall
  case chatMessageLarge
  case chatAuthorLarge
  case chatComposer
  case title
  case tabLabel
  case meta
  case profileDetail
  case widgetTitle
  case channelName
  case cardDetail
  case liveBadge
  case viewerCount
  case tag
  case followerCount
  case followLabel
  case categoryName
  case fieldHint
  case fieldText
  case profileEdit
  case editSectionLabel
  case editRowTitle
  case editRowValue
  case bioText
  case bioCounter
  case editSectionFooter
  case journeyTitle
  case journeyMessage
  case journeyControl
  case journeyChoiceName
  case journeyChoiceDetail
  case journeyRowTitle

  public var font: Font {
    switch self {
    case .hero: .heroText
    case .actionLabel: .actionLabel
    case .dialogTitle: .dialogTitle
    case .dialogMessage: .dialogMessage
    case .display: .displayText
    case .body: .bodyText
    case .chatMessage: .chatText
    case .chatAuthor: .chatAuthorText
    case .chatMessageSmall: .chatTextSmall
    case .chatAuthorSmall: .chatAuthorTextSmall
    case .chatMessageLarge: .chatTextLarge
    case .chatAuthorLarge: .chatAuthorTextLarge
    case .chatComposer: .supportingText
    case .title: .titleText
    case .tabLabel: .tabLabel
    case .meta: .metaText
    case .profileDetail: .supportingText
    case .widgetTitle: .actionLabel
    case .channelName: .displayText
    case .cardDetail: .supportingText
    case .liveBadge: .liveBadge
    case .viewerCount: .viewerCount
    case .tag: .tagText
    case .followerCount: .viewerCount
    case .followLabel: .displayText
    case .categoryName: .actionLabel
    case .fieldHint: .hintText
    case .fieldText: .supportingText
    case .profileEdit: .chatAuthorText
    case .editSectionLabel: .viewerCount
    case .editRowTitle: .actionLabel
    case .editRowValue: .viewerCount
    case .bioText: .supportingText
    case .bioCounter: .viewerCount
    case .editSectionFooter: .metaText
    case .journeyTitle: .titleText
    case .journeyMessage: .supportingText
    case .journeyControl: .actionLabel
    case .journeyChoiceName: .actionLabel
    case .journeyChoiceDetail: .supportingText
    case .journeyRowTitle: .actionLabel
    }
  }
}

public enum LayoutRole: Sendable {
  case heroInset
  case heroRowGap
  case sloganGap
  case sloganBottom
  case actionInset
  case actionGap
  case actionHeight
  case actionRadius
  case screenInset
  case dialogWidth
  case dialogPadding
  case dialogTitleGap
  case dialogActionsTop
  case dialogActionGap
  case dialogRadius
  case chatInset
  case chatRowGap
  case chatUnreadGap
  case chatUnreadLabelGap
  case chatUnreadLineWidth
  case composerHeight
  case composerPadding
  case composerRadius
  case menuRowHeight
  case menuRowPadding
  case menuIconWidth
  case menuLabelGap
  case menuCardGap
  case menuCardRadius
  case tabBarHeight
  case tabBarTopInset
  case tabLabelGap
  case tabIconSize
  case avatarGlyphInset
  case createButtonWidth
  case createButtonHeight
  case createGlyphSize
  case avatarRingWidth
  case avatarRingGap
  case browseTabGap
  case browseTabIndicatorHeight
  case browseTabIndicatorGap
  case categoryGridGap
  case categoryRowGap
  case categoryNameTop
  case liveDotSize
  case liveDotGap
  case categoryTagPaddingH
  case categoryTagPaddingV
  case categoryTagGap
  case categoryHeaderCoverWidth
  case categoryHeaderGap
  case categoryHeaderLineGap
  case followButtonHeight
  case followButtonColumnGap
  case followingButtonWidth
  case followGlyphGap
  case followingGlyphGap
  case profileBannerHeight
  case profileAvatarSize
  case profileAvatarOverlap
  case profileAvatarGlyphInset
  case profileAvatarGap
  case profileNameTop
  case profileBioTop
  case profileHeaderBottom
  case categoryCardCoverWidth
  case categoryCardRadius
  case categoryCardBorderWidth
  case categoryCardTextGap
  case categoryResultCoverWidth
  case categoryResultGap
  case categoryResultTextGap
  case categorySearchFieldHeight
  case categorySearchFieldRadius
  case widgetInset
  case widgetGap
  case widgetHeaderHeight
  case widgetHeaderPadding
  case widgetRadius
  case dockButtonSize
  case dockGap
  case dockRingWidth
  case dockRingGap
  case mediaInset
  case liveBadgePadding
  case liveBadgeHeight
  case liveBadgeRadius
  case cardInset
  case cardInfoTop
  case cardInfoBottom
  case cardAvatarSize
  case cardAvatarGlyphInset
  case cardAvatarGap
  case cardLineGap
  case profileEditTop
  case profileEditTrailing
  case editSectionLabelGap
  case editRowPadding
  case editRowLineGap
  case bioFieldPadding
  case bioFieldBottom
  case bioFieldDividerHeight
  case bioCounterInset
  case editSectionGap
  case editImageRowPadding
  case brandAvatarSize
  case brandAvatarRing
  case brandAvatarGlyphInset
  case editRowIconSize
  case journeyHeaderHeight
  case journeyHeaderGap
  case journeyControlSize
  case journeyProgressHeight
  case journeyMessageGap
  case journeyContentGap
  case journeyHeroWidth
  case journeyChoiceCoverWidth
  case journeyChoicePadding
  case journeyChipPaddingH
  case journeyChipPaddingV
  case journeyChipGap

  public var points: CGFloat {
    switch self {
    case .heroInset: Spacing.x40
    case .heroRowGap: Spacing.x4
    case .sloganGap: Spacing.x12
    case .sloganBottom: Spacing.x12
    case .actionInset: Spacing.x20
    case .actionGap: Spacing.x16
    case .actionHeight: Spacing.x44
    case .actionRadius: Radius.lg
    case .screenInset: Spacing.x16
    case .dialogWidth: Spacing.x300
    case .dialogPadding: Spacing.x16
    case .dialogTitleGap: Spacing.x15
    case .dialogActionsTop: Spacing.x16
    case .dialogActionGap: Spacing.x8
    case .dialogRadius: Radius.xxl
    case .chatInset: Spacing.x8
    case .chatRowGap: Spacing.x20
    case .chatUnreadGap: Spacing.x2
    case .chatUnreadLabelGap: Spacing.x4
    case .chatUnreadLineWidth: Spacing.x1
    case .composerHeight: Spacing.x40
    case .composerPadding: Spacing.x12
    case .composerRadius: Radius.lg
    case .menuRowHeight: Spacing.x56
    case .menuRowPadding: Spacing.x16
    case .menuIconWidth: Spacing.x20
    case .menuLabelGap: Spacing.x20
    case .menuCardGap: Spacing.x16
    case .menuCardRadius: Radius.xxl
    case .tabBarHeight: Spacing.x49
    case .tabBarTopInset: Spacing.x8
    case .tabLabelGap: Spacing.x2
    case .tabIconSize: Spacing.x24
    case .avatarGlyphInset: Spacing.x4
    case .createButtonWidth: Spacing.x72
    case .createButtonHeight: Spacing.x40
    case .createGlyphSize: Spacing.x16
    case .avatarRingWidth: Spacing.x2
    case .avatarRingGap: Spacing.x1
    case .browseTabGap: Spacing.x32
    case .browseTabIndicatorHeight: Spacing.x2
    case .browseTabIndicatorGap: Spacing.x8
    case .categoryGridGap: Spacing.x8
    case .categoryRowGap: Spacing.x16
    case .categoryNameTop: Spacing.x4
    case .liveDotSize: Spacing.x8
    case .liveDotGap: Spacing.x6
    case .categoryTagPaddingH: Spacing.x8
    case .categoryTagPaddingV: Spacing.x3
    case .categoryTagGap: Spacing.x4
    case .categoryHeaderCoverWidth: Spacing.x72
    case .categoryHeaderGap: Spacing.x16
    case .categoryHeaderLineGap: Spacing.x4
    case .followButtonHeight: Spacing.x40
    case .followButtonColumnGap: Spacing.x16
    case .followingButtonWidth: Spacing.x84
    case .followGlyphGap: Spacing.x14
    case .followingGlyphGap: Spacing.x6
    case .profileBannerHeight: Spacing.x70
    case .profileAvatarSize: Spacing.x88
    case .profileAvatarOverlap: Spacing.x16
    case .profileAvatarGlyphInset: Spacing.x20
    case .profileAvatarGap: Spacing.x8
    case .profileNameTop: Spacing.x8
    case .profileBioTop: Spacing.x20
    case .profileHeaderBottom: Spacing.x16
    case .categoryCardCoverWidth: Spacing.x72
    case .categoryCardRadius: Radius.xl
    case .categoryCardBorderWidth: Spacing.x1
    case .categoryCardTextGap: Spacing.x16
    case .categoryResultCoverWidth: Spacing.x75
    case .categoryResultGap: Spacing.x16
    case .categoryResultTextGap: Spacing.x8
    case .categorySearchFieldHeight: Spacing.x36
    case .categorySearchFieldRadius: Radius.lg
    case .widgetInset: Spacing.x14
    case .widgetGap: Spacing.x8
    case .widgetHeaderHeight: Spacing.x40
    case .widgetHeaderPadding: Spacing.x8
    case .widgetRadius: Radius.md
    case .dockButtonSize: Spacing.x44
    case .dockGap: Spacing.x16
    case .dockRingWidth: Spacing.x2
    case .dockRingGap: Spacing.x3
    case .mediaInset: Spacing.x8
    case .liveBadgePadding: Spacing.x5
    case .liveBadgeHeight: Spacing.x20
    case .liveBadgeRadius: Radius.md
    case .cardInset: Spacing.x16
    case .cardInfoTop: Spacing.x8
    case .cardInfoBottom: Spacing.x16
    case .cardAvatarSize: Spacing.x44
    case .cardAvatarGlyphInset: Spacing.x10
    case .cardAvatarGap: Spacing.x8
    case .cardLineGap: Spacing.x2
    case .profileEditTop: Spacing.x8
    case .profileEditTrailing: Spacing.x24
    case .editSectionLabelGap: Spacing.x8
    case .editRowPadding: Spacing.x8
    case .editRowLineGap: Spacing.x2
    case .bioFieldPadding: Spacing.x6
    case .bioFieldBottom: Spacing.x8
    case .bioFieldDividerHeight: Spacing.x1
    case .bioCounterInset: Spacing.x20
    case .editSectionGap: Spacing.x24
    case .editImageRowPadding: Spacing.x20
    case .brandAvatarSize: Spacing.x88
    case .brandAvatarRing: Spacing.x4
    case .brandAvatarGlyphInset: Spacing.x14
    case .editRowIconSize: Spacing.x20
    case .journeyHeaderHeight: Spacing.x44
    case .journeyHeaderGap: Spacing.x16
    case .journeyControlSize: Spacing.x24
    case .journeyProgressHeight: Spacing.x4
    case .journeyMessageGap: Spacing.x8
    case .journeyContentGap: Spacing.x24
    case .journeyHeroWidth: Spacing.x88
    case .journeyChoiceCoverWidth: Spacing.x47
    case .journeyChoicePadding: Spacing.x10
    case .journeyChipPaddingH: Spacing.x16
    case .journeyChipPaddingV: Spacing.x8
    case .journeyChipGap: Spacing.x8
    }
  }
}

public enum ActionButtonKind: Sendable {
  case primary
  case primaryOnAccent
  case secondaryOnAccent
  case secondary
  case destructive
  case cancel

  public var background: ColorRole {
    switch self {
    case .primary: .accent
    case .primaryOnAccent: .onAccent
    case .secondaryOnAccent: .accentSubtle
    case .secondary: .surfaceSecondary
    case .destructive: .danger
    case .cancel: .surfaceTertiary
    }
  }

  public var foreground: ColorRole {
    switch self {
    case .primaryOnAccent: .onAccentStrong
    case .primary, .secondaryOnAccent: .onAccent
    case .secondary, .cancel: .textPrimary
    case .destructive: .onDanger
    }
  }
}

public struct ActionButtonStyle: ButtonStyle {
  private let kind: ActionButtonKind

  public init(_ kind: ActionButtonKind) {
    self.kind = kind
  }

  public func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(TextRole.actionLabel.font)
      .foregroundStyle(kind.foreground.color)
      .frame(maxWidth: .infinity, minHeight: LayoutRole.actionHeight.points)
      .background(
        kind.background.color.opacity(configuration.isPressed ? 0.8 : 1),
        in: RoundedRectangle(cornerRadius: LayoutRole.actionRadius.points)
      )
  }
}
