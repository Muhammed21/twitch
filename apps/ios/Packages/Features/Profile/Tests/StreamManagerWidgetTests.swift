import Profile
import Testing

@Suite("Widgets du Stream Manager (Q12)")
struct StreamManagerWidgetTests {
  @Test("le dock propose les infos du stream, la clé puis les réglages OBS, et s'ouvre sur les infos")
  func dockOrder() {
    #expect(StreamManagerWidget.allCases == [.streamInfo, .streamKey, .obs])
    #expect(StreamManagerWidget.initial == .streamInfo)
  }

  @Test("chaque widget a son titre et son identifiant de dock")
  func titlesAndIdentifiers() {
    #expect(StreamManagerWidget.allCases.map { String(localized: $0.title) } == ["Stream Info", "Stream Key", "OBS Settings"])
    #expect(StreamManagerWidget.allCases.map(\.accessibilityIdentifier) == [
      "streamManager.widget.streamInfo",
      "streamManager.widget.streamKey",
      "streamManager.widget.obs",
    ])
  }
}
