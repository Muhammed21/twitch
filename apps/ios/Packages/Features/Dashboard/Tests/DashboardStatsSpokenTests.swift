import Dashboard
import DesignSystem
import Domain
import Foundation
import Testing

private let now = Date(timeIntervalSince1970: 1_793_736_000)
private let english = Locale(identifier: "en")

private func spoken(_ status: LiveStatus?) -> [String] {
  DashboardHomeScreen.statItems(status: status, now: now, locale: english).map(\.spokenValue)
}

@Suite("Chiffres du tableau de bord lus par VoiceOver")
struct DashboardStatsSpokenTests {
  @Test("en live, le temps de stream se dit en heures, minutes et secondes, pas en chiffres séparés par deux-points")
  func streamTimeInWords() throws {
    let status = try LiveStatus.live(viewers: ViewerCount(1234), startedAt: now.addingTimeInterval(-3723))

    #expect(spoken(status).first == "1 hour, 2 minutes, 3 seconds")
  }

  @Test("le nombre de spectateurs se dit tel qu'affiché")
  func viewersAsShown() throws {
    let status = try LiveStatus.live(viewers: ViewerCount(1234), startedAt: now)

    #expect(spoken(status)[1] == "1,234")
  }

  @Test("un chiffre indisponible se dit « indisponible » au lieu de « tiret tiret »")
  func unavailableInWords() {
    let unavailable = String(localized: DashboardText.unavailableStatSpoken)

    #expect(spoken(.offline) == [unavailable, unavailable, unavailable])
    #expect(["Unavailable", "Indisponible"].contains(unavailable))
  }

  @Test("une carte de chiffre se lit libellé d'abord, chiffre ensuite")
  func labelThenValue() {
    let item = DashboardStatItem(id: "viewers", value: "1,234", label: "Viewers", spokenValue: "1,234")

    #expect(item.accessibilityLabel == "Viewers")
    #expect(item.accessibilityValue == "1,234")
  }

  @Test("sans valeur parlée fournie, la carte dit le chiffre affiché")
  func spokenDefaultsToShown() {
    #expect(DashboardStatItem(id: "viewers", value: "12", label: "Viewers").spokenValue == "12")
  }
}
