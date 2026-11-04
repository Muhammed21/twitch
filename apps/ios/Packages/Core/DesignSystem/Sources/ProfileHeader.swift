import SwiftUI

public enum ProfileHeaderStyle {
  public static let banner = ColorRole.mediaBackground
  public static let name = ColorRole.textPrimary
  public static let lastLive = ColorRole.textPrimary
  public static let bio = ColorRole.textSecondary
}

public struct ProfileHeader: View {
  private let name: String
  private let lastLive: String?
  private let bio: String?
  private let edit: ProfileHeaderAction?

  public init(name: String, lastLive: String?, bio: String?, edit: ProfileHeaderAction? = nil) {
    self.name = name
    self.lastLive = lastLive
    self.bio = bio
    self.edit = edit
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      ProfileHeaderStyle.banner.color
        .frame(height: LayoutRole.profileBannerHeight.points)
        .background(alignment: .bottom) {
          ProfileHeaderStyle.banner.color.containerRelativeFrame(.vertical)
        }
        .overlay(alignment: .topTrailing) {
          if let edit { ProfileEditButton(edit: edit) }
        }
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
      if let bio {
        Text(bio)
          .font(TextRole.profileDetail.font)
          .foregroundStyle(ProfileHeaderStyle.bio.color)
          .padding(.top, LayoutRole.profileBioTop.points)
          .padding(.horizontal, LayoutRole.screenInset.points)
          .accessibilityIdentifier("profile.bio")
      }
    }
    .padding(.bottom, LayoutRole.profileHeaderBottom.points)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
