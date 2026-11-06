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
  private let pictures: ProfilePictures
  private let settings: ProfileHeaderAction?
  private let edit: ProfileHeaderAction?

  public init(
    name: String,
    lastLive: String?,
    pictures: ProfilePictures = ProfilePictures(),
    settings: ProfileHeaderAction? = nil,
    edit: ProfileHeaderAction? = nil
  ) {
    self.name = name
    self.lastLive = lastLive
    self.pictures = pictures
    self.settings = settings
    self.edit = edit
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      ProfileBanner(imageURL: pictures.banner, settings: settings, edit: edit)
      HStack(alignment: .top, spacing: LayoutRole.profileAvatarGap.points) {
        ProfileAvatar(url: pictures.avatar)
          .padding(.top, -LayoutRole.profileAvatarOverlap.points)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 0) {
          Text(name)
            .font(TextRole.title.font)
            .foregroundStyle(ProfileHeaderStyle.name.color)
            .accessibilityAddTraits(.isHeader)
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

public struct ProfilePictures: Equatable, Sendable {
  let avatar: URL?
  let banner: URL?

  public init(avatar: URL? = nil, banner: URL? = nil) {
    self.avatar = avatar
    self.banner = banner
  }
}

enum ProfilePicture {
  static func loaded(_ phase: AsyncImagePhase) -> Image? {
    guard case let .success(image) = phase else { return nil }
    return image
  }
}

struct ProfileAvatar: View {
  let url: URL?

  var body: some View {
    AsyncImage(url: url) { phase in
      if let image = ProfilePicture.loaded(phase) {
        image.resizable().scaledToFill()
          .frame(width: LayoutRole.profileAvatarSize.points, height: LayoutRole.profileAvatarSize.points)
          .clipShape(Circle())
      } else {
        DefaultAvatar(
          diameter: LayoutRole.profileAvatarSize.points,
          glyphInset: LayoutRole.profileAvatarGlyphInset.points
        )
      }
    }
  }
}

public struct ProfileBanner: View {
  private let imageURL: URL?
  private let settings: ProfileHeaderAction?
  private let edit: ProfileHeaderAction?
  @State private var reach: CGFloat = 0

  public init(imageURL: URL? = nil, settings: ProfileHeaderAction?, edit: ProfileHeaderAction? = nil) {
    self.imageURL = imageURL
    self.settings = settings
    self.edit = edit
  }

  public var body: some View {
    ProfileHeaderStyle.banner.color
      .frame(height: LayoutRole.profileBannerHeight.points)
      .background(alignment: .bottom) {
        ProfileHeaderStyle.banner.color.containerRelativeFrame(.vertical)
      }
      .overlay(alignment: .bottom) { picture }
      .overlay(alignment: .top) { bannerControls }
      .onGeometryChange(for: CGFloat.self) { max(0, $0.frame(in: .global).minY) } action: { reach = $0 }
  }

  private var picture: some View {
    Color.clear
      .frame(height: LayoutRole.profileBannerHeight.points + reach)
      .overlay {
        AsyncImage(url: imageURL) { phase in
          if let image = ProfilePicture.loaded(phase) {
            image.resizable().scaledToFill()
          }
        }
      }
      .clipped()
      .allowsHitTesting(false)
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
