import Foundation
import Paywall
import Testing

private func text(_ resource: LocalizedStringResource, in identifier: String) -> String {
  var localized = resource
  localized.locale = Locale(identifier: identifier)
  return String(localized: localized)
}

@Suite("Cartes d'avantages repliables de la page Turbo (abonnement/turbo--avantages-deplies)")
struct PaywallPerkTests {
  @Test("les cartes ne promettent que les avantages de l'ADR 0051 : le badge, puis la couleur de pseudo")
  func order() {
    #expect(PaywallPerk.allCases == [.badge, .color])
  }

  @Test(
    "chaque carte porte un titre et une description, en anglais et en français",
    arguments: [
      (
        PaywallPerk.badge, "en_US", "Battery Chat Badge",
        "Show the Battery Chat Badge next to your username in every chat. "
          + "Other viewers see it on each of your messages, in every channel you visit."
      ),
      (
        .color, "en_US", "Custom Username Color",
        "Pick the color of your username in chat. "
          + "Everyone in the channel sees your messages under the color you chose, in every chat."
      ),
      (
        .badge, "fr_FR", "Badge batterie dans le chat",
        "Affichez le badge batterie à côté de votre pseudo dans tous les chats. "
          + "Les autres viewers le voient sur chacun de vos messages, sur toutes les chaînes."
      ),
      (
        .color, "fr_FR", "Couleur de pseudo personnalisée",
        "Choisissez la couleur de votre pseudo dans le chat. "
          + "Tout le monde voit vos messages sous la couleur choisie, dans tous les chats."
      ),
    ]
  )
  func texts(perk: PaywallPerk, locale: String, title: String, description: String) {
    #expect(text(perk.title, in: locale) == title)
    #expect(text(perk.detail, in: locale) == description)
  }

  @Test("toutes les cartes sont repliées à l'ouverture de la page")
  func collapsedByDefault() {
    let expansion = PaywallPerkExpansion()

    #expect(PaywallPerk.allCases.allSatisfy { !expansion.isExpanded($0) })
  }

  @Test("toucher une carte la déplie sans toucher aux autres, la toucher encore la replie")
  func toggle() {
    let opened = PaywallPerkExpansion().toggling(.badge)

    #expect(opened.isExpanded(.badge))
    #expect(!opened.isExpanded(.color))
    #expect(opened.toggling(.color).isExpanded(.badge))
    #expect(!opened.toggling(.badge).isExpanded(.badge))
  }

  @Test(
    "VoiceOver annonce l'état de la carte",
    arguments: [
      (true, "en_US", "Expanded"),
      (false, "en_US", "Collapsed"),
      (true, "fr_FR", "Déplié"),
      (false, "fr_FR", "Replié"),
    ]
  )
  func accessibilityState(isExpanded: Bool, locale: String, expected: String) {
    #expect(text(PaywallText.perkState(isExpanded: isExpanded), in: locale) == expected)
  }

  @Test("repliée, la carte tronque le titre à une ligne et la description à deux ; dépliée, rien n'est tronqué")
  func collapsedLines() {
    let collapsed = PaywallPerkExpansion()
    let expanded = collapsed.toggling(.badge)

    #expect(collapsed.titleLineLimit(for: .badge) == 1)
    #expect(collapsed.detailLineLimit(for: .badge) == 2)
    #expect(expanded.titleLineLimit(for: .badge) == nil)
    #expect(expanded.detailLineLimit(for: .badge) == nil)
  }
}
