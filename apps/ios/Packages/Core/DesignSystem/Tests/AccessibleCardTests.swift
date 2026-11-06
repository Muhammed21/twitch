import DesignSystem
import SwiftUI
import Testing

@Suite("Carte lue par VoiceOver en une seule phrase, avec ses actions au rotor")
struct AccessibleCardTests {
  @Test("la phrase enchaîne les éléments de la carte dans l'ordre de lecture, séparés par une virgule")
  func sentenceInReadingOrder() {
    let card = AccessibleCard(parts: ["fakup_", "En direct", "Soirée chill", "Just Chatting", "1,2 k spectateurs"])

    #expect(card.label == "fakup_, En direct, Soirée chill, Just Chatting, 1,2 k spectateurs")
  }

  @Test("un élément absent ou vide ne laisse ni virgule en trop ni silence")
  func skipsMissingParts() {
    let card = AccessibleCard(parts: [nil, "fakup_", "", "  ", "Soirée chill", nil])

    #expect(card.label == "fakup_, Soirée chill")
  }

  @Test("la carte s'annonce comme un bouton : un double tap ouvre son contenu")
  func announcedAsButton() {
    #expect(AccessibleCard(parts: ["fakup_"]).traits == .isButton)
  }

  @Test("une carte sélectionnée l'annonce en plus du bouton")
  func selectedCard() {
    #expect(AccessibleCard(parts: ["Fortnite"], isSelected: true).traits == [.isButton, .isSelected])
  }

  @Test("l'indice n'est lu que s'il dit quelque chose")
  func hintOnlyWhenMeaningful() {
    #expect(AccessibleCard(parts: ["fakup_"], hint: "Ouvre la chaîne").hint == "Ouvre la chaîne")
    #expect(AccessibleCard(parts: ["fakup_"], hint: " ").hint == nil)
    #expect(AccessibleCard(parts: ["fakup_"]).hint == nil)
  }

  @Test("les actions secondaires sont proposées au rotor dans l'ordre donné")
  func secondaryActionsInOrder() {
    let card = AccessibleCard(
      parts: ["fakup_"],
      actions: [AccessibleAction(name: "Suivre") {}, AccessibleAction(name: "Couper le son") {}]
    )

    #expect(card.actions.map(\.name) == ["Suivre", "Couper le son"])
  }

  @Test("une action secondaire déclenche ce qu'elle annonce")
  func actionPerforms() {
    let followed = Flag()
    let action = AccessibleAction(name: "Suivre") { followed.raise() }

    action.perform()

    #expect(followed.isRaised)
  }

  @Test("une cible tactile fait au moins 44 pt, la cible minimale d'iOS, par le token d'espacement")
  func minimumTapTarget() {
    #expect(TapTarget.minimum == 44)
  }

  @Test("un bouton plus petit que 44 pt agrandit sa zone de toucher de la moitié de l'écart de chaque côté")
  func outsetOfSmallButton() {
    #expect(TapTarget.outset(forVisible: 36) == 4)
    #expect(TapTarget.outset(forVisible: 32) == 6)
  }

  @Test("un bouton de 44 pt ou plus garde sa zone de toucher")
  func noOutsetForLargeButton() {
    #expect(TapTarget.outset(forVisible: 44) == 0)
    #expect(TapTarget.outset(forVisible: 50) == 0)
  }

  @Test("aux tailles de texte d'accessibilité, une ligne limitée s'agrandit au lieu de tronquer")
  func readableLineLimit() {
    #expect(ReadableLines.limit(1, at: .large) == 1)
    #expect(ReadableLines.limit(2, at: .xxxLarge) == 2)
    #expect(ReadableLines.limit(1, at: .accessibility1) == nil)
    #expect(ReadableLines.limit(1, at: .accessibility5) == nil)
  }

  @Test("un onglet se lit comme un bouton, sélectionné s'il est actif, pas comme un en-tête")
  func tabTraits() {
    #expect(BrowseTabsStyle.traits(isSelected: true) == [.isButton, .isSelected])
    #expect(BrowseTabsStyle.traits(isSelected: false) == .isButton)
  }
}

private final class Flag {
  private(set) var isRaised = false

  func raise() {
    isRaised = true
  }
}
