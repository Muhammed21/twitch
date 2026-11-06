import Domain
import SwiftUI

public enum StreamInfoText {
  public static let navigationTitle = ProfileText.editStreamInfo
  public static let cancel = ProfileText.cancel
  public static let save = LocalizedStringResource("editStreamInfo.save", bundle: .module)
  public static let title = ProfileText.title
  public static let titlePlaceholder = LocalizedStringResource("editStreamInfo.title.placeholder", bundle: .module)
  public static let notifications = LocalizedStringResource("editStreamInfo.notifications", bundle: .module)
  public static let notificationsHint = LocalizedStringResource("editStreamInfo.notifications.hint", bundle: .module)
  public static let category = ProfileText.category
  public static let chooseCategory = ProfileText.chooseCategory
  public static let tags = LocalizedStringResource("editStreamInfo.tags", bundle: .module)
  public static let tagsPlaceholder = LocalizedStringResource("editStreamInfo.tags.placeholder", bundle: .module)
  public static let tagRejected = LocalizedStringResource("editStreamInfo.tags.rejected", bundle: .module)
  public static let tagsHint = LocalizedStringResource("editStreamInfo.tags.hint", bundle: .module)
  public static let classification = LocalizedStringResource("editStreamInfo.classification", bundle: .module)
  public static let classificationPlaceholder = LocalizedStringResource("editStreamInfo.classification.placeholder", bundle: .module)
  public static let classificationHint = LocalizedStringResource("editStreamInfo.classification.hint", bundle: .module)
  public static let language = LocalizedStringResource("editStreamInfo.language", bundle: .module)
  public static let branded = LocalizedStringResource("editStreamInfo.branded", bundle: .module)
  public static let brandedHint = LocalizedStringResource("editStreamInfo.branded.hint", bundle: .module)
  public static let markers = LocalizedStringResource("editStreamInfo.markers", bundle: .module)
  public static let markersPlaceholder = LocalizedStringResource("editStreamInfo.markers.placeholder", bundle: .module)
  public static let addMarker = LocalizedStringResource("editStreamInfo.markers.add", bundle: .module)
  public static let share = LocalizedStringResource("editStreamInfo.share", bundle: .module)
  public static let shareAction = LocalizedStringResource("editStreamInfo.share.action", bundle: .module)

  public static func remaining(_ count: Int) -> LocalizedStringResource {
    ProfileText.remaining(count)
  }

  public static func notificationPlaceholder(_ name: String) -> LocalizedStringResource {
    LocalizedStringResource("editStreamInfo.notifications.placeholder \(name)", bundle: .module)
  }

  public static func removeTag(_ tag: String) -> LocalizedStringResource {
    LocalizedStringResource("editStreamInfo.tags.remove \(tag)", bundle: .module)
  }

  public static func label(_ label: ContentLabel) -> LocalizedStringResource {
    switch label {
    case .sexualThemes: LocalizedStringResource("contentLabel.sexualThemes", bundle: .module)
    case .drugsIntoxicationTobacco: LocalizedStringResource("contentLabel.drugs", bundle: .module)
    case .gambling: LocalizedStringResource("contentLabel.gambling", bundle: .module)
    case .violentGraphic: LocalizedStringResource("contentLabel.violent", bundle: .module)
    case .profanity: LocalizedStringResource("contentLabel.profanity", bundle: .module)
    case .matureRatedGames: LocalizedStringResource("contentLabel.mature", bundle: .module)
    case .politicsSensitive: LocalizedStringResource("contentLabel.politics", bundle: .module)
    }
  }
}
