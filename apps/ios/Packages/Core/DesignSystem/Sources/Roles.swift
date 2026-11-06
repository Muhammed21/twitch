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
  case feedOverlay
  case feedChannelName
  case feedTitle
  case filterChip
  case tag
  case followerCount
  case followLabel
  case categoryName
  case categoryViewers
  case fieldHint
  case fieldText
  case profileEdit
  case profileAction
  case profileAboutTitle
  case profileAboutMessage
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
  case paywallHeadline
  case paywallBody
  case paywallLegal
  case sheetHero
  case sheetHeroDetail
  case sheetRowTitle
  case sheetRowDetail
  case sheetCancel
  case transitionTitle
  case dashboardTitle
  case dashboardEmpty
  case dashboardAction
  case dashboardStatValue
  case dashboardStatLabel
  case dashboardPreviewLabel
  case dashboardStreamButton
  case dashboardHint
  case dashboardActivityEmpty
  case dashboardLink
  case streamManagerTitle
  case activityTitle
  case activityEmptyTitle
  case activityEmptyMessage
  case activityEmptyAction

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
    case .widgetTitle: .liveBadge
    case .channelName: .displayText
    case .cardDetail: .supportingText
    case .liveBadge: .liveBadge
    case .viewerCount: .viewerCount
    case .feedOverlay: .metaText
    case .feedChannelName: .displayText
    case .feedTitle: .viewerCount
    case .filterChip: .headingText
    case .tag: .tagText
    case .followerCount: .viewerCount
    case .followLabel: .displayText
    case .categoryName: .actionLabel
    case .categoryViewers: .viewerCount
    case .fieldHint: .hintText
    case .fieldText: .supportingText
    case .profileEdit: .chatAuthorText
    case .profileAction: .headingText
    case .profileAboutTitle: .actionLabel
    case .profileAboutMessage: .supportingText
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
    case .paywallHeadline: .displayText
    case .paywallBody: .supportingText
    case .paywallLegal: .viewerCount
    case .sheetHero: .sheetHeroText
    case .sheetHeroDetail: .supportingText
    case .sheetRowTitle: .sheetRowTitle
    case .sheetRowDetail: .viewerCount
    case .sheetCancel: .supportingText
    case .transitionTitle: .actionLabel
    case .dashboardTitle: .displayText
    case .dashboardEmpty: .displayText
    case .dashboardAction: .supportingText
    case .dashboardStatValue: .displayText
    case .dashboardStatLabel: .hintText
    case .dashboardPreviewLabel: .tagText
    case .dashboardStreamButton: .cardAction
    case .dashboardHint: .hintText
    case .dashboardActivityEmpty: .viewerCount
    case .dashboardLink: .cardAction
    case .streamManagerTitle: .actionLabel
    case .activityTitle: .displayText
    case .activityEmptyTitle: .actionLabel
    case .activityEmptyMessage: .supportingText
    case .activityEmptyAction: .actionLabel
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
  case chatBadgeSize
  case chatBadgeDrop
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
  case categoryTileDotGap
  case categoryTileTagTop
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
  case profileBannerControlSize
  case profileBannerControlCenter
  case profileBannerGlyph
  case profileEditHeight
  case profileEditPadding
  case profileActionHeight
  case profileActionGap
  case profileActionRowGap
  case profileActionGlyph
  case profileActionGlyphGap
  case profileTabTop
  case profileAboutTop
  case profileAboutTextGap
  case profileAboutInset
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
  case widgetBorderWidth
  case widgetFieldHeight
  case widgetFieldRadius
  case widgetFieldBorderWidth
  case widgetFieldInset
  case streamManagerHeaderHeight
  case streamManagerHeaderBottom
  case streamManagerTitleGap
  case streamManagerItemGap
  case streamManagerAvatarSize
  case dockButtonWidth
  case dockButtonHeight
  case dockInset
  case dockTop
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
  case feedBadgeInset
  case feedBadgePaddingH
  case feedBadgeDotGap
  case feedViewersInset
  case feedViewersPaddingH
  case feedViewersRadius
  case feedOverlayPaddingV
  case feedInfoInset
  case feedInfoTop
  case feedAvatarSize
  case feedAvatarGap
  case feedTitleTop
  case feedDividerTop
  case feedDividerWidth
  case feedDividerHeight
  case feedDividerBottom
  case filterChipsTop
  case filterChipsBottom
  case filterChipHeight
  case filterChipPaddingH
  case filterChipGap
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
  case sheetInset
  case sheetCardGap
  case sheetCardRadius
  case sheetRadius
  case sheetCancelHeight
  case sheetHeroPadding
  case sheetHeroLineGap
  case sheetHeroGlyphGap
  case sheetRowPadding
  case sheetRowGlyphGap
  case sheetRowLineGap
  case transitionGlitchHeight
  case transitionTitleGap
  case dashboardHeaderHeight
  case dashboardAvatarSize
  case dashboardIconTarget
  case dashboardIconGap
  case dashboardIconOverhang
  case dashboardFieldHeight
  case dashboardFieldRadius
  case dashboardFieldTop
  case dashboardFieldGlyphGap
  case dashboardEmptyTop
  case dashboardEmptyWidth
  case dashboardEmptyClapperboardGap
  case dashboardEmptyBarChartGap
  case dashboardPillHeight
  case dashboardPillLeading
  case dashboardPillTrailing
  case dashboardCardRadius
  case dashboardCardsTop
  case dashboardCardGap
  case dashboardStatsHeight
  case dashboardStatsInset
  case dashboardStatGap
  case dashboardPreviewRadius
  case dashboardPreviewLabelLeading
  case dashboardPreviewLabelTop
  case dashboardStreamPadding
  case dashboardStreamButtonHeight
  case dashboardStreamGap
  case dashboardHintInset
  case dashboardHintTop
  case dashboardActivityHeight
  case activityHeaderHeight
  case activityEmptyInset
  case activityEmptyGap
  case activityActionHeight
  case activityActionPadding
  case activityNotificationsIllustrationGap
  case activityWhispersIllustrationGap
}
