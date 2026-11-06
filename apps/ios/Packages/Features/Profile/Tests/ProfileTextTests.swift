import Foundation
import Profile
import Testing

private let lastLiveCases: [(TimeInterval, String)] = [
  (86340, "23h"),
  (2700, "45m"),
  (277_200, "3d"),
  (20, "0m"),
]

private func lastLiveLine(_ short: String) -> String {
  shown(english: "Last live \(short) ago", french: "Dernier live il y a \(short)")
}

@Suite("Textes de ma chaîne")
struct ProfileTextTests {
  @Test(
    "le dernier live s'affiche en durée courte, comme « Last live 23h ago » sur profil/menu-compte--defaut",
    arguments: lastLiveCases
  )
  func lastLive(elapsed: TimeInterval, expected: String) {
    let now = Date(timeIntervalSince1970: 1_800_000_000)

    #expect(ProfileText.lastLive(at: now.addingTimeInterval(-elapsed), now: now, locale: Locale(identifier: "en_US")) == lastLiveLine(expected))
  }

  @Test("un dernier live daté dans le futur, horloge décalée, s'affiche comme à l'instant")
  func lastLiveInFuture() {
    let now = Date(timeIntervalSince1970: 1_800_000_000)

    #expect(ProfileText.lastLive(at: now.addingTimeInterval(120), now: now, locale: Locale(identifier: "en_US")) == lastLiveLine("0m"))
  }

  @Test("l'en-tête du profil propose « Gestionnaire de stream », « Statistiques » et « Essayer sans publicité » (IMG_9614)")
  func headerActions() {
    #expect(english(ProfileText.streamManager) == "Stream Manager")
    #expect(french(ProfileText.streamManager) == "Gestionnaire de stream")
    #expect(english(ProfileText.analytics) == "Analytics")
    #expect(french(ProfileText.analytics) == "Statistiques")
    #expect(english(ProfileText.tryAdFree) == "Try Ad-Free")
    #expect(french(ProfileText.tryAdFree) == "Essayer sans publicité")
  }

  @Test("un seul onglet sous l'en-tête, « À propos » : Accueil, Clips et Vidéos attendent le contexte media (IMG_9614 à 9617)")
  func sections() {
    #expect(ProfileSection.allCases == [.about])
    #expect(english(ProfileText.title(of: .about)) == "About")
    #expect(french(ProfileText.title(of: .about)) == "À propos")
  }

  @Test("« À propos » sans bio invite à se présenter (IMG_9615)")
  func aboutEmpty() {
    #expect(english(ProfileText.aboutEmptyTitle) == "Tell us more!")
    #expect(french(ProfileText.aboutEmptyTitle) == "Dites-nous-en plus !")
    #expect(english(ProfileText.aboutEmptyMessage) == "You're more than just a profile… tell us everything!")
    #expect(french(ProfileText.aboutEmptyMessage) == "Vous êtes plus qu'un simple profil… racontez-nous tout !")
  }

  @Test("les réglages OBS recommandés : H.264, AAC, image clé toutes les 2 s, 6 000 kb/s au plus")
  func obsSettings() {
    let rows = ProfileText.obsSettings.map { "\(english($0.label)): \(english($0.value))" }

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
    #expect(english(ProfileText.notice(notice)) == text)
  }

  @Test("les libellés du sélecteur de catégorie, comme sur creer/edition-infos-diffusion--defaut")
  func categoryPicker() {
    #expect(english(ProfileText.category) == "Category")
    #expect(english(ProfileText.categoryHint) == "All content must adhere to and be categorized according to our guidelines.")
    #expect(english(ProfileText.chooseCategory) == "Search for a category")
    #expect(english(ProfileText.removeCategory) == "Remove category")
    #expect(english(ProfileText.searchCategories) == "Search")
    #expect(english(ProfileText.noCategoryFound) == "No results found")
    #expect(english(ProfileText.categorySearchFailed) == "Couldn't search categories.")
  }

  @Test("la réinitialisation de la clé se confirme : l'ancienne clé cesse de marcher")
  func rotationConfirmation() {
    #expect(english(ProfileText.resetKey) == "Reset")
    #expect(english(ProfileText.resetKeyTitle) == "Reset your stream key?")
    #expect(english(ProfileText.resetKeyMessage) == "Your current key will stop working right away.")
  }

  @Test("en français, le sélecteur de catégorie reprend les libellés de docs/new-reference-ui/IMG_9628")
  func frenchCategoryPicker() {
    #expect(french(ProfileText.category) == "Catégorie")
    #expect(french(ProfileText.chooseCategory) == "Rechercher une catégorie")
    #expect(french(ProfileText.searchCategories) == "Rechercher")
    #expect(french(ProfileText.resetKeyTitle) == "Réinitialiser votre clé de stream\u{00A0}?")
  }

  @Test("en français, les réglages OBS gardent leurs valeurs, avec les unités françaises")
  func frenchObsSettings() {
    #expect(ProfileText.obsSettings.map { "\(french($0.label)) : \(french($0.value))" } == [
      "Encodeur vidéo : H.264",
      "Encodeur audio : AAC",
      "Intervalle d'images clés : 2\u{00A0}s",
      "Débit maximal : 6\u{202F}000\u{00A0}Kbit/s",
    ])
  }
}
