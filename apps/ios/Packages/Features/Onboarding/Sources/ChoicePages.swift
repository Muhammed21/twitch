import DesignSystem
import Domain
import SwiftUI

struct CategoriesPage: View {
  @Environment(CategoryChoices.self) private var choices
  @Environment(\.locale) private var locale

  var body: some View {
    JourneyPage(
      title: PersonalizationText.categoriesTitle,
      message: PersonalizationText.categoriesMessage,
      primary: PersonalizationText.next,
      selectionCount: choices.selectionCount
    ) {
      ChoicesContent(
        state: choices.state,
        empty: PersonalizationText.categoriesEmpty,
        failed: PersonalizationText.categoriesFailed,
        retry: choices.load
      ) { categories in
        ScrollView {
          VStack(alignment: .leading, spacing: LayoutRole.journeyMessageGap.points) {
            JourneyChoiceCard {
              ForEach(Array(categories.enumerated()), id: \.element.slug) { index, category in
                if index > 0 {
                  JourneyChoiceDivider()
                }
                row(category)
              }
            }
            if choices.failedSlug != nil {
              Text(PersonalizationText.followFailed)
                .font(TextRole.journeyMessage.font)
                .foregroundStyle(JourneyStyle.message.color)
            }
          }
        }
        .scrollIndicators(.hidden)
      }
    }
    .task {
      if choices.state == .loading {
        await choices.load()
      }
    }
  }

  private func row(_ category: BrowseCategory) -> some View {
    Button {
      Task { await choices.toggle(category.slug) }
    } label: {
      CategoryChoiceRow(
        name: category.name,
        detail: PersonalizationText.viewers(category.viewers, locale: locale),
        coverURL: category.imageURL,
        isSelected: choices.isFollowing(category.slug),
        isPending: choices.isPending(category.slug)
      )
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("journey.category.\(category.slug.rawValue)")
  }
}

struct InterestsPage: View {
  @Environment(InterestChoices.self) private var choices
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    JourneyPage(
      title: PersonalizationText.interestsTitle,
      message: PersonalizationText.interestsMessage,
      primary: PersonalizationText.next,
      selectionCount: choices.selectionCount,
      onContinue: choices.save
    ) {
      ChoicesContent(
        state: choices.state,
        empty: PersonalizationText.interestsEmpty,
        failed: PersonalizationText.interestsFailed,
        retry: choices.load
      ) { tags in
        ScrollView {
          JourneyFlow {
            ForEach(tags, id: \.name) { tag in
              Button {
                withAnimation(JourneyMotion.selection(reduceMotion: reduceMotion)) {
                  choices.toggle(tag)
                }
              } label: {
                InterestChip(name: tag.name, isSelected: choices.isSelected(tag))
              }
              .buttonStyle(.plain)
              .accessibilityIdentifier("journey.interest.\(tag.name)")
            }
          }
        }
        .scrollIndicators(.hidden)
      }
    }
    .task {
      if choices.state == .loading {
        await choices.load()
      }
    }
  }
}

struct ChoicesContent<Item: Equatable & Sendable, Loaded: View>: View {
  let state: ChoicesState<Item>
  let empty: String
  let failed: String
  let retry: () async -> Void
  @ViewBuilder let loaded: ([Item]) -> Loaded

  var body: some View {
    switch state {
    case .loading:
      ProgressView()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    case let .loaded(items):
      loaded(items)
    case .empty:
      notice(empty)
        .frame(maxHeight: .infinity)
    case .failed:
      VStack(spacing: LayoutRole.journeyContentGap.points) {
        notice(failed)
        Button(PersonalizationText.retry) {
          Task { await retry() }
        }
        .buttonStyle(ActionButtonStyle(.secondary))
        .accessibilityIdentifier("journey.retry")
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private func notice(_ text: String) -> some View {
    Text(text)
      .font(TextRole.journeyMessage.font)
      .foregroundStyle(JourneyStyle.message.color)
      .multilineTextAlignment(.center)
      .frame(maxWidth: .infinity)
  }
}
