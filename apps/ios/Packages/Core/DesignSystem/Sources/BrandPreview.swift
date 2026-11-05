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

public struct BrandPicture {
  let local: Image?
  let url: URL?

  public init(local: Image?, url: URL?) {
    self.local = local
    self.url = url
  }

  var isSet: Bool { local != nil || url != nil }
}

public struct BrandPreview: View {
  private let avatar: BrandPicture
  private let banner: BrandPicture
  private let isSendingAvatar: Bool
  private let isSendingBanner: Bool

  public init(avatar: BrandPicture, banner: BrandPicture, isSendingAvatar: Bool, isSendingBanner: Bool) {
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
      .overlay { bannerPicture }
      .clipped()
      .overlay {
        if isSendingBanner { ProgressView() }
      }
      .overlay { ringedAvatar }
      .accessibilityHidden(true)
  }

  @ViewBuilder private var backdrop: some View {
    switch BrandBackdrop(hasAvatar: avatar.isSet) {
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

  @ViewBuilder private var bannerPicture: some View {
    if let local = banner.local {
      local.resizable().scaledToFill()
    } else if let url = banner.url {
      AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.clear }
    }
  }

  @ViewBuilder private var avatarPicture: some View {
    if let local = avatar.local {
      local.resizable().scaledToFill().clipShape(Circle())
    } else if let url = avatar.url {
      AsyncImage(url: url) { $0.resizable().scaledToFill().clipShape(Circle()) } placeholder: { defaultAvatar }
    } else {
      defaultAvatar
    }
  }

  private var defaultAvatar: some View {
    DefaultAvatar(
      diameter: LayoutRole.brandAvatarSize.points,
      glyphInset: LayoutRole.brandAvatarGlyphInset.points
    )
  }
}
