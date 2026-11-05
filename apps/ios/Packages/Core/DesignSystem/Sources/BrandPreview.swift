import DesignTokens
import SwiftUI

public enum BrandStyle {
  public static let bannerAspectRatio = Spacing.x5 / Spacing.x2
  public static let avatarRing = ColorRole.avatarRing
}

public enum BrandBackdrop: Equatable {
  case gradient(top: ColorRole, bottom: ColorRole)
  case plain(ColorRole)

  public init(hasAvatar: Bool) {
    self = hasAvatar ? .plain(.mediaBackground) : .gradient(top: .bannerStart, bottom: .bannerEnd)
  }
}

public struct BrandPreview: View {
  private let avatar: Image?
  private let banner: Image?
  private let isSendingAvatar: Bool
  private let isSendingBanner: Bool

  public init(avatar: Image?, banner: Image?, isSendingAvatar: Bool, isSendingBanner: Bool) {
    self.avatar = avatar
    self.banner = banner
    self.isSendingAvatar = isSendingAvatar
    self.isSendingBanner = isSendingBanner
  }

  public var body: some View {
    Color.clear
      .aspectRatio(BrandStyle.bannerAspectRatio, contentMode: .fit)
      .frame(maxWidth: .infinity)
      .background { backdrop }
      .overlay {
        if let banner {
          banner.resizable().scaledToFill()
        }
      }
      .clipped()
      .overlay {
        if isSendingBanner { ProgressView() }
      }
      .overlay { ringedAvatar }
      .accessibilityHidden(true)
  }

  @ViewBuilder private var backdrop: some View {
    switch BrandBackdrop(hasAvatar: avatar != nil) {
    case let .gradient(top, bottom):
      LinearGradient(colors: [top.color, bottom.color], startPoint: .top, endPoint: .bottom)
    case let .plain(role):
      role.color
    }
  }

  private var ringedAvatar: some View {
    avatarPicture
      .frame(width: LayoutRole.brandAvatarSize.points, height: LayoutRole.brandAvatarSize.points)
      .overlay {
        if isSendingAvatar { ProgressView() }
      }
      .padding(LayoutRole.brandAvatarRing.points)
      .background(BrandStyle.avatarRing.color, in: Circle())
  }

  @ViewBuilder private var avatarPicture: some View {
    if let avatar {
      avatar.resizable().scaledToFill().clipShape(Circle())
    } else {
      DefaultAvatar(
        diameter: LayoutRole.brandAvatarSize.points,
        glyphInset: LayoutRole.brandAvatarGlyphInset.points
      )
    }
  }
}
