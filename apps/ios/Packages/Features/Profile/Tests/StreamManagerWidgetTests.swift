import DesignSystem
import Domain
import Profile
import SwiftUI
import Testing

@Suite("Widgets du gestionnaire de stream (IMG_9618)")
struct StreamManagerWidgetTests {
  @Test("le dock s'ouvre sur le Chat, suivi des infos du stream, de la clé et des réglages OBS")
  func dockOrder() {
    #expect(StreamManagerWidget.allCases == [.chat, .streamInfo, .streamKey, .obs])
    #expect(StreamManagerWidget.initial == .chat)
  }

  @Test("chaque widget a son titre et son identifiant de dock")
  func titlesAndIdentifiers() {
    #expect(StreamManagerWidget.allCases.map { english($0.title) } == ["Chat", "Stream Info", "Stream Key", "OBS Settings"])
    #expect(french(StreamManagerWidget.chat.title) == "Chat")
    #expect(StreamManagerWidget.allCases.map(\.accessibilityIdentifier) == [
      "streamManager.widget.chat",
      "streamManager.widget.streamInfo",
      "streamManager.widget.streamKey",
      "streamManager.widget.obs",
    ])
  }

  @Test("le Chat prend la bulle de la capture dans le dock")
  func chatIcon() {
    #expect(StreamManagerWidget.chat.icon == .glyph(.widgetChat))
  }

  @Test("l'en-tête montre « HORS LIGNE » tant que la chaîne n'est pas en live")
  func offlineBadge() {
    #expect(StreamManagerHeaderText.offline(status: nil).map(french) == "HORS LIGNE")
    #expect(StreamManagerHeaderText.offline(status: .offline).map(english) == "OFFLINE")
    #expect(StreamManagerHeaderText.offline(status: .live(viewers: nil)) == nil)
  }

  @Test("l'en-tête s'intitule Gestionnaire de stream ; le « ⋮ » d'un widget se nomme Plus d'options")
  func headerTexts() {
    #expect(french(StreamManagerHeaderText.title) == "Gestionnaire de stream")
    #expect(french(StreamManagerHeaderText.widgetMenu) == "Plus d'options")
    #expect(english(StreamManagerHeaderText.widgetMenu) == "More options")
  }
}

@MainActor
@Suite("Chat du widget, fourni par l'app (ADR 0010, une feature n'importe pas une autre)")
struct StreamManagerChatSlotTests {
  @Test("sans chat fourni par l'app, le widget n'en affiche aucun")
  func emptyByDefault() {
    #expect(!EnvironmentValues().streamManagerChat.isProvided)
  }

  @Test("l'app fournit le chat de la chaîne du créateur")
  func provided() {
    #expect(StreamManagerChatSlot { _ in AnyView(EmptyView()) }.isProvided)
  }
}
