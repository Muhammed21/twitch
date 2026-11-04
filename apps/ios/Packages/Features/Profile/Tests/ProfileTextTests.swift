import Foundation
import Profile
import Testing

private let lastLiveCases: [(TimeInterval, String)] = [
  (86340, "Last live 23h ago"),
  (2700, "Last live 45m ago"),
  (277_200, "Last live 3d ago"),
  (20, "Last live 0m ago"),
]

@Suite("Textes de ma chaîne")
struct ProfileTextTests {
  @Test(
    "le dernier live s'affiche en durée courte, comme « Last live 23h ago » sur profil/menu-compte--defaut",
    arguments: lastLiveCases
  )
  func lastLive(elapsed: TimeInterval, expected: String) {
    let now = Date(timeIntervalSince1970: 1_800_000_000)

    #expect(ProfileText.lastLive(at: now.addingTimeInterval(-elapsed), now: now, locale: Locale(identifier: "en_US")) == expected)
  }

  @Test("un dernier live daté dans le futur, horloge décalée, s'affiche comme à l'instant")
  func lastLiveInFuture() {
    let now = Date(timeIntervalSince1970: 1_800_000_000)

    #expect(ProfileText.lastLive(at: now.addingTimeInterval(120), now: now, locale: Locale(identifier: "en_US")) == "Last live 0m ago")
  }

  @Test("les réglages OBS recommandés : H.264, AAC, image clé toutes les 2 s, 6 000 kb/s au plus")
  func obsSettings() {
    let rows = ProfileText.obsSettings.map { "\(String(localized: $0.label)): \(String(localized: $0.value))" }

    #expect(rows == [
      "Video encoder: H.264",
      "Audio encoder: AAC",
      "Keyframe interval: 2 s",
      "Maximum bitrate: 6,000 Kbps",
    ])
  }

  @Test(
    "un avis pour la copie de la clé, la clé illisible, le titre enregistré ou refusé, et la clé réinitialisée ou non",
    arguments: [
      (MyChannelStore.Notice.keyCopied, "Stream key copied."),
      (.keyUnavailable, "Couldn't load your stream key."),
      (.titleSaved, "Stream info updated successfully."),
      (.titleFailed, "Couldn't update your stream info."),
      (.keyRotated, "Stream key reset. Update it in your streaming software."),
      (.keyRotationFailed, "Couldn't reset your stream key."),
    ]
  )
  func notices(notice: MyChannelStore.Notice, text: String) {
    #expect(String(localized: ProfileText.notice(notice)) == text)
  }

  @Test("les libellés du sélecteur de catégorie, comme sur creer/edition-infos-diffusion--defaut")
  func categoryPicker() {
    #expect(String(localized: ProfileText.category) == "Category")
    #expect(String(localized: ProfileText.categoryHint) == "All content must adhere to and be categorized according to our guidelines.")
    #expect(String(localized: ProfileText.chooseCategory) == "Search for a category")
    #expect(String(localized: ProfileText.removeCategory) == "Remove category")
    #expect(String(localized: ProfileText.searchCategories) == "Search")
    #expect(String(localized: ProfileText.noCategoryFound) == "No results found")
    #expect(String(localized: ProfileText.categorySearchFailed) == "Couldn't search categories.")
  }

  @Test("la réinitialisation de la clé se confirme : l'ancienne clé cesse de marcher")
  func rotationConfirmation() {
    #expect(String(localized: ProfileText.resetKey) == "Reset")
    #expect(String(localized: ProfileText.resetKeyTitle) == "Reset your stream key?")
    #expect(String(localized: ProfileText.resetKeyMessage) == "Your current key will stop working right away.")
  }
}
