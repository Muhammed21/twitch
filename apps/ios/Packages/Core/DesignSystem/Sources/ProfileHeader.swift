import SwiftUI

public enum ProfileHeaderStyle {
  public static let banner = ColorRole.mediaBackground
  public static let name = ColorRole.textPrimary
  public static let lastLive = ColorRole.textPrimary
  public static let bio = ColorRole.textSecondary
  public static let bannerControl = ColorRole.scrim
  public static let onBannerControl = ColorRole.onMedia
  public static let action = ColorRole.surfaceSecondary
  public static let onAction = ColorRole.textPrimary
  public static let aboutTitle = ColorRole.textSecondary
  public static let aboutMessage = ColorRole.textSecondary
}

public struct ProfileHeader: View {
  private let name: String
  private let lastLive: String?
  private let settings: ProfileHeaderAction?
  private let edit: ProfileHeaderAction?

  public init(
    name: String,
    lastLive: String?,
    settings: ProfileHeaderAction? = nil,
    edit: ProfileHeaderAction? = nil
  ) {
    self.name = name
    self.lastLive = lastLive
    self.settings = settings
    self.edit = edit
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      ProfileBanner(settings: settings, edit: edit)
      HStack(alignment: .top, spacing: LayoutRole.profileAvatarGap.points) {
        DefaultAvatar(
          diameter: LayoutRole.profileAvatarSize.points,
          glyphInset: LayoutRole.profileAvatarGlyphInset.points
        )
        .padding(.top, -LayoutRole.profileAvatarOverlap.points)
        .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 0) {
          Text(name)
            .font(TextRole.title.font)
            .foregroundStyle(ProfileHeaderStyle.name.color)
          if let lastLive {
            Text(lastLive)
              .font(TextRole.profileDetail.font)
              .foregroundStyle(ProfileHeaderStyle.lastLive.color)
          }
        }
        .padding(.top, LayoutRole.profileNameTop.points)
      }
      .padding(.horizontal, LayoutRole.screenInset.points)
    }
    .padding(.bottom, LayoutRole.profileHeaderBottom.points)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

public struct ProfileBanner: View {
  private let settings: ProfileHeaderAction?
  private let edit: ProfileHeaderAction?

  public init(settings: ProfileHeaderAction?, edit: ProfileHeaderAction? = nil) {
    self.settings = settings
    self.edit = edit
  }

  public var body: some View {
    ProfileHeaderStyle.banner.color
      .frame(height: LayoutRole.profileBannerHeight.points)
      .background(alignment: .bottom) {
        ProfileHeaderStyle.banner.color.containerRelativeFrame(.vertical)
      }
      .overlay(alignment: .top) { bannerControls }
  }

  private var bannerControls: some View {
    HStack(spacing: 0) {
      if let settings { ProfileSettingsButton(settings: settings) }
      Spacer(minLength: 0)
      if let edit { ProfileEditButton(edit: edit) }
    }
    .padding(.horizontal, LayoutRole.screenInset.points)
    .alignmentGuide(.top) { $0[VerticalAlignment.center] - LayoutRole.profileBannerControlCenter.points }
  }
}
