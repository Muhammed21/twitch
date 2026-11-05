import Domain
import Foundation
import Profile
import Testing

private func localized(_ resource: LocalizedStringResource, in language: String) -> String {
  var localized = resource
  localized.locale = Locale(identifier: language)
  return String(localized: localized)
}

@Suite("Textes de la feuille Modifier les infos du stream (IMG_9628, IMG_9629)")
struct StreamInfoTextTests {
  @Test(
    "chaque libellé de la capture existe en français et en anglais",
    arguments: [
      (StreamInfoText.navigationTitle, "Modifier les infos du stream", "Edit Stream Info"),
      (StreamInfoText.cancel, "Annuler", "Cancel"),
      (StreamInfoText.save, "Enregistrer", "Save"),
      (StreamInfoText.title, "Titre", "Title"),
      (StreamInfoText.titlePlaceholder, "Donnez un titre à votre stream", "Give your stream a title"),
      (StreamInfoText.notifications, "Notifications de live", "Go Live Notification"),
      (StreamInfoText.notificationsHint, "Vous ne pouvez envoyer qu'une notification par stream.", "You can only send one notification per stream."),
      (StreamInfoText.category, "Catégorie", "Category"),
      (StreamInfoText.chooseCategory, "Chercher une catégorie", "Search for a category"),
      (StreamInfoText.tags, "Tags", "Tags"),
      (StreamInfoText.tagsPlaceholder, "Saisissez votre tag", "Enter your tag"),
      (StreamInfoText.classification, "Classification de contenu", "Content Classification"),
      (StreamInfoText.classificationPlaceholder, "Sélectionner les descripteurs de contenu", "Select content descriptors"),
      (StreamInfoText.language, "Langue", "Language"),
      (StreamInfoText.branded, "Contenu promotionnel", "Branded Content"),
      (StreamInfoText.markers, "Repères", "Markers"),
      (StreamInfoText.markersPlaceholder, "Description (facultative)", "Description (optional)"),
      (StreamInfoText.addMarker, "Ajouter un repère", "Add Marker"),
      (StreamInfoText.share, "Partager le lien vers la chaîne", "Share link to channel"),
      (StreamInfoText.shareAction, "Partager", "Share"),
    ]
  )
  func labels(resource: LocalizedStringResource, french: String, english: String) {
    #expect(localized(resource, in: "fr") == french)
    #expect(localized(resource, in: "en") == english)
  }

  @Test("les caractères restants et la notification de live nomment leur valeur")
  func formatted() {
    #expect(localized(StreamInfoText.remaining(140), in: "fr") == "140 restants")
    #expect(localized(StreamInfoText.notificationPlaceholder("Fakup_"), in: "fr") == "Fakup_ a commencé à diffuser en live\u{00A0}!")
    #expect(localized(StreamInfoText.notificationPlaceholder("Fakup_"), in: "en") == "Fakup_ went live!")
  }

  @Test("chaque descripteur de contenu a un nom en français et en anglais", arguments: ContentLabel.allCases)
  func contentLabels(label: ContentLabel) {
    #expect(!localized(StreamInfoText.label(label), in: "fr").contains("contentLabel."))
    #expect(!localized(StreamInfoText.label(label), in: "en").contains("contentLabel."))
    #expect(localized(StreamInfoText.label(label), in: "fr") != localized(StreamInfoText.label(label), in: "en"))
  }
}
