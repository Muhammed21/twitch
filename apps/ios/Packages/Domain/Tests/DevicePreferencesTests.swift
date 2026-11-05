import Domain
import Testing

@Suite("Préférences de l'appareil (ADR 0051, §4)")
struct DevicePreferencesTests {
  @Test("par défaut, l'app suit le thème du système, lit les vidéos sur Wi-Fi et données mobiles, et floute les thèmes sexuels")
  func referenceDefaults() {
    let defaults = DevicePreferences.defaults(language: .french)

    #expect(defaults.appearance == .system)
    #expect(defaults.videoAutoplay == .wifiAndMobileData)
    #expect(defaults.chatTextSize == .medium)
    #expect(defaults.showsChatTimestamps == false)
    #expect(defaults.liveLanguage == .french)
    #expect(defaults.content == ContentPreferences(hidden: [], blursSexualThemes: true))
    #expect(defaults.interests.isEmpty)
  }

  @Test("la langue des lives par défaut suit la langue de l'appareil, l'anglais sinon")
  func languageFromLocale() {
    #expect(LiveLanguage(localeIdentifier: "fr_FR") == .french)
    #expect(LiveLanguage(localeIdentifier: "pt-BR") == .portuguese)
    #expect(LiveLanguage(localeIdentifier: "ja") == .japanese)
    #expect(LiveLanguage(localeIdentifier: "tlh") == .english)
  }

  @Test("un changement ne touche que sa préférence")
  func applying() {
    let defaults = DevicePreferences.defaults(language: .english)

    let dark = defaults.applying(.appearance(.dark))

    #expect(dark.appearance == .dark)
    #expect(dark.applying(.appearance(.system)) == defaults)
    #expect(defaults.applying(.videoAutoplay(.never)).videoAutoplay == .never)
    #expect(defaults.applying(.chatTextSize(.large)).chatTextSize == .large)
    #expect(defaults.applying(.chatTimestamps(true)).showsChatTimestamps)
    #expect(defaults.applying(.liveLanguage(.german)).liveLanguage == .german)
    #expect(defaults.applying(.interests(["FPS"])).interests == ["FPS"])
    let content = ContentPreferences(hidden: [.gambling], blursSexualThemes: false)
    #expect(defaults.applying(.content(content)).content == content)
  }

  @Test("chaque changement porte le nom de préférence de la taxonomie (ADR 0051, §7)")
  func preferenceNames() {
    let names = [
      PreferenceUpdate.appearance(.dark), .videoAutoplay(.never), .chatTextSize(.small), .chatTimestamps(true),
      .liveLanguage(.english), .content(ContentPreferences(hidden: [], blursSexualThemes: true)), .interests([]),
    ].map(\.preference.rawValue)

    #expect(names == [
      "appearance", "video_autoplay", "chat_text_size", "chat_timestamps", "live_language", "content_filters", "interests",
    ])
  }

  @Test("la valeur recopiée dans l'analytics est fermée et stable : codes, booléens, listes triées")
  func analyticsValues() {
    #expect(PreferenceUpdate.appearance(.dark).value == "dark")
    #expect(PreferenceUpdate.videoAutoplay(.wifiOnly).value == "wifi_only")
    #expect(PreferenceUpdate.chatTextSize(.large).value == "large")
    #expect(PreferenceUpdate.chatTimestamps(true).value == "true")
    #expect(PreferenceUpdate.chatTimestamps(false).value == "false")
    #expect(PreferenceUpdate.liveLanguage(.portuguese).value == "pt")
    #expect(PreferenceUpdate.interests(["RPG", "FPS", "Chill"]).value == "Chill,FPS,RPG")
    #expect(
      PreferenceUpdate.content(ContentPreferences(hidden: [.profanity, .gambling], blursSexualThemes: true)).value
        == "blur_sexual_themes,gambling,profanity"
    )
    #expect(PreferenceUpdate.content(ContentPreferences(hidden: [], blursSexualThemes: false)).value == "")
    #expect(PreferenceUpdate.content(ContentPreferences(hidden: [.sexualThemes], blursSexualThemes: true)).value == "sexual_themes")
  }

  @Test("masquer les thèmes sexuels rend le floutage sans objet, comme le grisé de preferences-contenu--filtres-actives")
  func blurDisabledWhenHidden() {
    #expect(ContentPreferences(hidden: [], blursSexualThemes: true).isBlurAvailable)
    #expect(!ContentPreferences(hidden: [.sexualThemes], blursSexualThemes: true).isBlurAvailable)
  }

  @Test(
    "la lecture auto démarre selon le réglage et le coût du réseau",
    arguments: [
      (VideoAutoplay.wifiAndMobileData, false, true),
      (.wifiAndMobileData, true, true),
      (.wifiOnly, false, true),
      (.wifiOnly, true, false),
      (.never, false, false),
      (.never, true, false),
    ]
  )
  func autoplay(setting: VideoAutoplay, isExpensive: Bool, allowed: Bool) {
    #expect(setting.allowsPlayback(onExpensiveNetwork: isExpensive) == allowed)
  }

  @Test("les sept labels de contenu suivent l'ordre de preferences-contenu--defaut")
  func contentLabelsOrder() {
    #expect(ContentLabel.allCases.map(\.rawValue) == [
      "sexual_themes", "drugs_intoxication_tobacco", "gambling", "violent_graphic",
      "profanity", "mature_rated_games", "politics_sensitive",
    ])
  }

  @Test(
    "chaque préférence relit sa valeur courante, celle que preference:changed compare",
    arguments: [
      PreferenceUpdate.appearance(.dark),
      .videoAutoplay(.never),
      .chatTextSize(.small),
      .chatTimestamps(true),
      .liveLanguage(.korean),
      .content(ContentPreferences(hidden: [.gambling], blursSexualThemes: false)),
      .interests(["RPG"]),
    ]
  )
  func readsBack(update: PreferenceUpdate) {
    #expect(DevicePreferences.defaults(language: .english).applying(update).update(for: update.preference) == update)
  }
}
