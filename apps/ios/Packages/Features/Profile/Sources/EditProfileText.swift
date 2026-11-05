import Foundation

public enum EditProfileText {
  public static let edit = LocalizedStringResource("profile.edit", bundle: .module)
  public static let title = LocalizedStringResource("editProfile.title", bundle: .module)
  public static let about = LocalizedStringResource("editProfile.about", bundle: .module)
  public static let bio = LocalizedStringResource("editProfile.bio", bundle: .module)
  public static let bioPlaceholder = LocalizedStringResource("editProfile.bio.placeholder", bundle: .module)
  public static let bioFailed = LocalizedStringResource("editProfile.bio.failed", bundle: .module)

  public static func remaining(_ count: Int) -> LocalizedStringResource {
    LocalizedStringResource("editProfile.bio.remaining \(count)", bundle: .module)
  }
}
