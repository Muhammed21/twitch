import DesignSystem
import SwiftUI

public struct PersonalizationScreen: View {
  @Environment(PersonalizationJourney.self) private var journey
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  public init() {}

  public var body: some View {
    VStack(spacing: 0) {
      JourneyHeader()
      ZStack {
        page
          .id(journey.step)
          .transition(JourneyMotion.pageTransition(direction: journey.direction, reduceMotion: reduceMotion))
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .clipped()
    }
    .background(ColorRole.background.color.ignoresSafeArea())
    .animation(JourneyMotion.page(reduceMotion: reduceMotion), value: journey.index)
    .task { journey.start() }
  }

  @ViewBuilder private var page: some View {
    switch journey.step {
    case .intro: IntroPage()
    case .categories: CategoriesPage()
    case .interests: InterestsPage()
    case .summary: SummaryPage()
    default: EmptyView()
    }
  }
}

struct JourneyHeader: View {
  @Environment(PersonalizationJourney.self) private var journey

  var body: some View {
    HStack(spacing: LayoutRole.journeyHeaderGap.points) {
      Button {
        journey.back()
      } label: {
        Image(systemName: "chevron.left")
          .font(TextRole.journeyControl.font)
          .foregroundStyle(JourneyStyle.control.color)
          .frame(width: LayoutRole.journeyControlSize.points, height: LayoutRole.journeyControlSize.points)
      }
      .accessibilityLabel(PersonalizationText.back)
      .accessibilityIdentifier("journey.back")
      .opacity(journey.canGoBack ? 1 : 0)
      .disabled(!journey.canGoBack)
      JourneyProgressBar(progress: journey.progress)
        .accessibilityLabel(PersonalizationText.progress(page: journey.index + 1, of: journey.steps.count))
      Button(PersonalizationText.skip) { journey.skip() }
        .font(TextRole.journeyControl.font)
        .foregroundStyle(JourneyStyle.skip.color)
        .accessibilityIdentifier("journey.skip")
        .opacity(journey.step.isSkippable ? 1 : 0)
        .disabled(!journey.step.isSkippable)
    }
    .padding(.horizontal, LayoutRole.screenInset.points)
    .frame(height: LayoutRole.journeyHeaderHeight.points)
  }
}

struct JourneyPage<Content: View>: View {
  @Environment(PersonalizationJourney.self) private var journey
  private let title: String
  private let message: String
  private let primary: String
  private let selectionCount: Int
  private let onContinue: () -> Void
  private let content: Content

  init(
    title: String,
    message: String,
    primary: String,
    selectionCount: Int = 0,
    onContinue: @escaping () -> Void = {},
    @ViewBuilder content: () -> Content
  ) {
    self.title = title
    self.message = message
    self.primary = primary
    self.selectionCount = selectionCount
    self.onContinue = onContinue
    self.content = content()
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(title)
        .font(TextRole.journeyTitle.font)
        .foregroundStyle(JourneyStyle.title.color)
        .accessibilityAddTraits(.isHeader)
      Text(message)
        .font(TextRole.journeyMessage.font)
        .foregroundStyle(JourneyStyle.message.color)
        .padding(.top, LayoutRole.journeyMessageGap.points)
      content
        .padding(.top, LayoutRole.journeyContentGap.points)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      Button(primary) {
        onContinue()
        journey.complete(selectionCount: selectionCount)
      }
      .buttonStyle(ActionButtonStyle(.primary))
      .accessibilityIdentifier("journey.continue")
      .padding(.top, LayoutRole.journeyMessageGap.points)
    }
    .padding([.horizontal, .bottom], LayoutRole.screenInset.points)
    .padding(.top, LayoutRole.journeyContentGap.points)
  }
}

struct JourneyHeroPage<Hero: View>: View {
  @Environment(PersonalizationJourney.self) private var journey
  private let title: String
  private let message: String
  private let primary: String
  private let hero: Hero

  init(title: String, message: String, primary: String, @ViewBuilder hero: () -> Hero) {
    self.title = title
    self.message = message
    self.primary = primary
    self.hero = hero()
  }

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)
      hero
      Text(title)
        .font(TextRole.journeyTitle.font)
        .foregroundStyle(JourneyStyle.title.color)
        .accessibilityAddTraits(.isHeader)
        .padding(.top, LayoutRole.journeyContentGap.points)
      Text(message)
        .font(TextRole.journeyMessage.font)
        .foregroundStyle(JourneyStyle.message.color)
        .padding(.top, LayoutRole.journeyMessageGap.points)
      Spacer(minLength: 0)
      Button(primary) { journey.complete(selectionCount: 0) }
        .buttonStyle(ActionButtonStyle(.primary))
        .accessibilityIdentifier("journey.continue")
    }
    .multilineTextAlignment(.center)
    .padding([.horizontal, .bottom], LayoutRole.screenInset.points)
  }
}
