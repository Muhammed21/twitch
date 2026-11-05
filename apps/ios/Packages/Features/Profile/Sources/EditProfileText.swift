import Domain
import Foundation

public enum EditProfileText {
  public static let edit = LocalizedStringResource("profile.edit", bundle: .module)
  public static let title = LocalizedStringResource("editProfile.title", bundle: .module)
  public static let about = LocalizedStringResource("editProfile.about", bundle: .module)
  public static let bio = LocalizedStringResource("editProfile.bio", bundle: .module)
  public static let bioPlaceholder = LocalizedStringResource("editProfile.bio.placeholder", bundle: .module)
  public static let bioFailed = LocalizedStringResource("editProfile.bio.failed", bundle: .module)
  public static let brand = LocalizedStringResource("editProfile.brand", bundle: .module)
  public static let picture = LocalizedStringResource("editProfile.picture", bundle: .module)
  public static let pictureHint = LocalizedStringResource("editProfile.picture.hint", bundle: .module)
  public static let banner = LocalizedStringResource("editProfile.banner", bundle: .module)
  public static let bannerHint = LocalizedStringResource("editProfile.banner.hint", bundle: .module)
  public static let brandFooter = LocalizedStringResource("editProfile.brand.footer", bundle: .module)
  public static let chooseExisting = LocalizedStringResource("editProfile.photo.choose", bundle: .module)
  public static let takePhoto = LocalizedStringResource("editProfile.photo.take", bundle: .module)
  public static let close = LocalizedStringResource("editProfile.photo.close", bundle: .module)

  public static func remaining(_ count: Int) -> LocalizedStringResource {
    LocalizedStringResource("editProfile.bio.remaining \(count)", bundle: .module)
  }

  @MainActor
  public static func notice(for phase: ProfileImageStore.Phase) -> LocalizedStringResource? {
    guard case let .failed(purpose, failure) = phase else { return nil }
    return switch (purpose, failure) {
    case (.avatar, .tooLarge): LocalizedStringResource("editProfile.picture.tooLarge", bundle: .module)
    case (.banner, .tooLarge): LocalizedStringResource("editProfile.banner.tooLarge", bundle: .module)
    case (.avatar, .tooSmall): LocalizedStringResource("editProfile.picture.tooSmall", bundle: .module)
    case (.banner, .tooSmall): LocalizedStringResource("editProfile.banner.tooSmall", bundle: .module)
    case (.avatar, .notSaved): LocalizedStringResource("editProfile.picture.failed", bundle: .module)
    case (.banner, .notSaved): LocalizedStringResource("editProfile.banner.failed", bundle: .module)
    case (_, .cameraMissing): LocalizedStringResource("editProfile.camera.missing", bundle: .module)
    case (_, .cameraRefused): LocalizedStringResource("editProfile.camera.refused", bundle: .module)
    }
  }
}
