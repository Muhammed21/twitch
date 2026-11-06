import Dashboard
import DesignSystem
import Domain
import Foundation
import Testing

@Suite("Accueil du tableau de bord, hors ligne (IMG_9624)")
struct DashboardHomeTests {
  @Test("les chiffres de la chaîne suivent l'ordre de la capture")
  func statOrder() {
    #expect(DashboardStat.allCases == [.streamTime, .viewers, .followers])
  }

  @Test(
    "chaque chiffre porte le libellé de la capture",
    arguments: [
      (DashboardStat.streamTime, "Stream time", "Temps de stream"),
      (.viewers, "Viewers", "Spectateurs"),
      (.followers, "Followers", "Followers"),
    ]
  )
  func statLabels(stat: DashboardStat, english expectedEnglish: String, french expectedFrench: String) {
    #expect(english(DashboardText.label(of: stat)) == expectedEnglish)
    #expect(french(DashboardText.label(of: stat)) == expectedFrench)
  }

  @Test("un chiffre que l'API ne fournit pas s'affiche --")
  func unavailableStat() {
    #expect(french(DashboardText.unavailableStat) == "--")
  }

  @Test("hors ligne, la carte affiche -- sous chaque libellé")
  func statItems() {
    let items = DashboardHomeScreen.statItems(status: .offline, now: .now, locale: Locale(identifier: "fr"))
    #expect(items.map(\.value) == Array(repeating: String(localized: DashboardText.unavailableStat), count: 3))
    #expect(items.map(\.label) == DashboardStat.allCases.map { String(localized: DashboardText.label(of: $0)) })
    #expect(Set(items.map(\.id)).count == 3)
  }

  @Test("la carte de stream hors ligne propose le Gestionnaire de stream et la modification des infos")
  func streamCard() {
    #expect(DashboardText.offline(status: .offline).map(english) == "OFFLINE")
    #expect(DashboardText.offline(status: .offline).map(french) == "HORS LIGNE")
    #expect(french(DashboardText.streamManager) == "Gestionnaire de stream")
    #expect(french(DashboardText.editStreamInfo) == "Modifier les infos du stream")
    #expect(
      french(DashboardText.streamManagerHint)
        == "Utilisez le gestionnaire de stream pour gérer votre chat, l'état de votre stream et plus encore."
    )
  }

  @Test("sans activité, la carte le dit et le lien vers toutes les activités reste affiché")
  func activity() {
    #expect(french(DashboardText.noRecentActivity) == "Pas d'activité récente")
    #expect(french(DashboardText.seeAllActivity) == "Voir toutes les activités")
    #expect(english(DashboardText.seeAllActivity) == "See all activity")
  }

  @Test("l'aperçu dit HORS LIGNE tant que le statut du live n'est pas connu")
  func offlineBadgeWithoutStatus() {
    #expect(DashboardText.offline(status: nil).map(french) == "HORS LIGNE")
  }

  @Test("l'aperçu ne dit plus HORS LIGNE pendant le live")
  func noOfflineBadgeWhileLive() {
    #expect(DashboardText.offline(status: .live(viewers: nil, startedAt: .now)) == nil)
  }

  @Test("pendant le live, l'aperçu montre la vignette du live, renouvelée toutes les 10 s")
  func livePreview() throws {
    let thumbnail = try #require(URL(string: "http://192.168.4.233:3002/hls/channels/c/thumbnail.jpg"))
    let status = LiveStatus.live(viewers: nil, startedAt: nil, thumbnailURL: thumbnail)
    let start = Date(timeIntervalSince1970: 1_800_000_000)

    let first = DashboardHomeScreen.preview(status: status, now: start)
    let sameWindow = DashboardHomeScreen.preview(status: status, now: start.addingTimeInterval(9))
    let nextWindow = DashboardHomeScreen.preview(status: status, now: start.addingTimeInterval(10))

    #expect(first?.url == thumbnail)
    #expect(sameWindow == first)
    #expect(nextWindow?.url == thumbnail)
    #expect(nextWindow != first)
  }

  @Test("hors live, ou sans vignette, l'aperçu garde son fond")
  func noPreview() {
    #expect(DashboardHomeScreen.preview(status: nil, now: .now) == nil)
    #expect(DashboardHomeScreen.preview(status: .offline, now: .now) == nil)
    #expect(DashboardHomeScreen.preview(status: .live(viewers: nil, startedAt: .now), now: .now) == nil)
  }
}
