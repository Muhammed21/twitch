import DesignSystem
import Domain
import Foundation
import SwiftUI

struct IntroPage: View {
  var body: some View {
    JourneyHeroPage(
      title: PersonalizationText.introTitle,
      message: PersonalizationText.introMessage,
      primary: PersonalizationText.getStarted
    ) {
      GlitchMark()
        .frame(width: LayoutRole.journeyHeroWidth.points)
    }
  }
}

struct SummaryPage: View {
  var body: some View {
    JourneyHeroPage(
      title: PersonalizationText.summaryTitle,
      message: PersonalizationText.summaryMessage,
      primary: PersonalizationText.startWatching
    ) {
      GlitchMark()
        .frame(width: LayoutRole.journeyHeroWidth.points)
    }
  }
}

public enum PersonalizationText {
  public static var introTitle: String { String(localized: "journey.intro.title", bundle: .module) }
  public static var introMessage: String { String(localized: "journey.intro.message", bundle: .module) }
  public static var getStarted: String { String(localized: "journey.getStarted", bundle: .module) }
  public static var summaryTitle: String { String(localized: "journey.summary.title", bundle: .module) }
  public static var summaryMessage: String { String(localized: "journey.summary.message", bundle: .module) }
  public static var startWatching: String { String(localized: "journey.startWatching", bundle: .module) }
  public static var next: String { String(localized: "journey.next", bundle: .module) }
  public static var skip: String { String(localized: "journey.skip", bundle: .module) }
  public static var back: String { String(localized: "journey.back", bundle: .module) }

  public static var categoriesTitle: String { String(localized: "journey.categories.title", bundle: .module) }
  public static var categoriesMessage: String { String(localized: "journey.categories.message", bundle: .module) }
  public static var categoriesEmpty: String { String(localized: "journey.categories.empty", bundle: .module) }
  public static var categoriesFailed: String { String(localized: "journey.categories.failed", bundle: .module) }
  public static var followFailed: String { String(localized: "journey.categories.followFailed", bundle: .module) }
  public static var interestsTitle: String { String(localized: "journey.interests.title", bundle: .module) }
  public static var interestsMessage: String { String(localized: "journey.interests.message", bundle: .module) }
  public static var interestsEmpty: String { String(localized: "journey.interests.empty", bundle: .module) }
  public static var interestsFailed: String { String(localized: "journey.interests.failed", bundle: .module) }
  public static var retry: String { String(localized: "journey.retry", bundle: .module) }

  public static var contentTitle: String { String(localized: "journey.content.title", bundle: .module) }
  public static var contentMessage: String { String(localized: "journey.content.message", bundle: .module) }
  public static var contentSection: String { String(localized: "journey.content.section", bundle: .module) }
  public static var contentFooter: String { String(localized: "journey.content.footer", bundle: .module) }
  public static var blurTitle: String { String(localized: "journey.content.blur", bundle: .module) }
  public static var blurFooter: String { String(localized: "journey.content.blurFooter", bundle: .module) }
  public static var languageTitle: String { String(localized: "journey.language.title", bundle: .module) }
  public static var languageMessage: String { String(localized: "journey.language.message", bundle: .module) }

  public static var appearanceTitle: String { String(localized: "journey.appearance.title", bundle: .module) }
  public static var appearanceMessage: String { String(localized: "journey.appearance.message", bundle: .module) }
  public static var themeSection: String { String(localized: "journey.appearance.section", bundle: .module) }
  public static var matchSystemTheme: String { String(localized: "journey.appearance.system", bundle: .module) }
  public static var darkTheme: String { String(localized: "journey.appearance.dark", bundle: .module) }
  public static var autoplayTitle: String { String(localized: "journey.autoplay.title", bundle: .module) }
  public static var autoplayMessage: String { String(localized: "journey.autoplay.message", bundle: .module) }
  public static var chatTitle: String { String(localized: "journey.chat.title", bundle: .module) }
  public static var chatMessage: String { String(localized: "journey.chat.message", bundle: .module) }
  public static var chatTextSizeSection: String { String(localized: "journey.chat.section", bundle: .module) }
  public static var chatTimestamps: String { String(localized: "journey.chat.timestamps", bundle: .module) }

  public static func autoplay(_ autoplay: VideoAutoplay) -> String {
    switch autoplay {
    case .wifiAndMobileData: String(localized: "journey.autoplay.wifiAndMobileData", bundle: .module)
    case .wifiOnly: String(localized: "journey.autoplay.wifiOnly", bundle: .module)
    case .never: String(localized: "journey.autoplay.never", bundle: .module)
    }
  }

  public static func chatTextSize(_ size: ChatTextSize) -> String {
    switch size {
    case .small: String(localized: "journey.chat.small", bundle: .module)
    case .medium: String(localized: "journey.chat.medium", bundle: .module)
    case .large: String(localized: "journey.chat.large", bundle: .module)
    }
  }

  public static func hide(_ label: ContentLabel) -> String {
    switch label {
    case .sexualThemes: String(localized: "journey.content.hide.sexualThemes", bundle: .module)
    case .drugsIntoxicationTobacco: String(localized: "journey.content.hide.drugs", bundle: .module)
    case .gambling: String(localized: "journey.content.hide.gambling", bundle: .module)
    case .violentGraphic: String(localized: "journey.content.hide.violent", bundle: .module)
    case .profanity: String(localized: "journey.content.hide.profanity", bundle: .module)
    case .matureRatedGames: String(localized: "journey.content.hide.mature", bundle: .module)
    case .politicsSensitive: String(localized: "journey.content.hide.politics", bundle: .module)
    }
  }

  public static func languageName(_ language: LiveLanguage) -> String {
    let own = Locale(identifier: language.rawValue)
    return own.localizedString(forLanguageCode: language.rawValue)?.capitalized(with: own) ?? language.rawValue
  }

  public static func viewers(_ count: ViewerCount?, locale: Locale) -> String? {
    count.map {
      String(
        format: String(localized: "journey.categories.viewers", bundle: .module),
        $0.value.formatted(.number.notation(.compactName).locale(locale))
      )
    }
  }

  public static func progress(page: Int, of count: Int) -> String {
    String(format: String(localized: "journey.progress", bundle: .module), page, count)
  }
}
