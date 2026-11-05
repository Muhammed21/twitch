import DesignSystem
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

  public static func progress(page: Int, of count: Int) -> String {
    String(format: String(localized: "journey.progress", bundle: .module), page, count)
  }
}
