import Foundation
import Profile
import Testing

@Suite("Textes de ma chaîne")
struct ProfileTextTests {
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
    "un avis pour la copie de la clé, la clé illisible, et le titre enregistré ou refusé",
    arguments: [
      (MyChannelStore.Notice.keyCopied, "Stream key copied."),
      (.keyUnavailable, "Couldn't load your stream key."),
      (.titleSaved, "Stream info updated successfully."),
      (.titleFailed, "Couldn't update your stream info."),
    ]
  )
  func notices(notice: MyChannelStore.Notice, text: String) {
    #expect(String(localized: ProfileText.notice(notice)) == text)
  }
}
