import DesignSystem
import Domain
import SwiftUI

struct CategoryField: View {
  @Binding var chosen: ChannelCategory?

  var body: some View {
    VStack(alignment: .leading, spacing: LayoutRole.chatInset.points) {
      Text(ProfileText.category)
        .font(TextRole.display.font)
        .foregroundStyle(ColorRole.textPrimary.color)
      if let chosen {
        CategoryCard(name: chosen.name, coverURL: chosen.imageURL, clearLabel: String(localized: ProfileText.removeCategory)) {
          self.chosen = nil
        }
        .accessibilityIdentifier("editStreamInfo.category")
      } else {
        NavigationLink {
          CategorySearchScreen(chosen: $chosen)
        } label: {
          Text(ProfileText.chooseCategory)
            .font(TextRole.fieldText.font)
            .foregroundStyle(ColorRole.textSecondary.color)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(LayoutRole.composerPadding.points)
            .background(ColorRole.surfaceSecondary.color, in: RoundedRectangle(cornerRadius: LayoutRole.composerRadius.points))
        }
        .accessibilityIdentifier("editStreamInfo.chooseCategory")
      }
      Text(ProfileText.categoryHint)
        .font(TextRole.fieldHint.font)
        .foregroundStyle(CategoryPickerStyle.hint.color)
    }
  }
}

struct CategorySearchScreen: View {
  @Environment(CategorySearch.self) private var search
  @Environment(\.dismiss) private var dismiss
  @Binding var chosen: ChannelCategory?
  @State private var query = ""
  @FocusState private var isFocused: Bool

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: LayoutRole.categoryCardTextGap.points) {
        Button { dismiss() } label: {
          Image(systemName: "chevron.left")
            .font(TextRole.display.font)
            .foregroundStyle(ColorRole.textPrimary.color)
        }
        .accessibilityLabel(Text(ProfileText.cancel))
        searchField
      }
      .padding(LayoutRole.screenInset.points)
      ScrollView {
        LazyVStack(alignment: .leading, spacing: LayoutRole.categoryResultGap.points) {
          content
        }
        .padding(LayoutRole.screenInset.points)
      }
      .scrollDismissesKeyboard(.interactively)
    }
    .background(ColorRole.background.color.ignoresSafeArea())
    .toolbar(.hidden, for: .navigationBar)
    .onAppear { isFocused = true }
    .task(id: query) {
      try? await Task.sleep(for: CategorySearchTiming.debounce)
      guard !Task.isCancelled else { return }
      await search.search(query)
    }
  }

  private var searchField: some View {
    HStack(spacing: LayoutRole.categoryResultTextGap.points) {
      TextField(text: $query) { Text(ProfileText.searchCategories) }
        .font(TextRole.fieldText.font)
        .foregroundStyle(ColorRole.textPrimary.color)
        .focused($isFocused)
        .submitLabel(.search)
        .autocorrectionDisabled()
        .textInputAutocapitalization(.never)
        .accessibilityIdentifier("categorySearch.field")
      if !query.isEmpty {
        Button { query = "" } label: {
          Image(systemName: "xmark.circle.fill")
            .foregroundStyle(ColorRole.textSecondary.color)
        }
        .accessibilityLabel(Text(ProfileText.cancel))
      }
    }
    .padding(.horizontal, LayoutRole.composerPadding.points)
    .frame(height: LayoutRole.categorySearchFieldHeight.points)
    .background(
      CategoryPickerStyle.searchField.color,
      in: RoundedRectangle(cornerRadius: LayoutRole.categorySearchFieldRadius.points)
    )
  }

  @ViewBuilder private var content: some View {
    switch search.phase {
    case .idle, .loading:
      ProgressView().frame(maxWidth: .infinity)
    case .failed:
      message(ProfileText.categorySearchFailed)
    case let .results(categories) where categories.isEmpty:
      message(ProfileText.noCategoryFound)
    case let .results(categories):
      ForEach(categories) { category in
        Button {
          chosen = category
          dismiss()
        } label: {
          CategoryResultRow(name: category.name, coverURL: category.imageURL)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("categorySearch.result")
      }
    }
  }

  private func message(_ text: LocalizedStringResource) -> some View {
    Text(text)
      .font(TextRole.body.font)
      .foregroundStyle(ColorRole.textSecondary.color)
      .frame(maxWidth: .infinity)
  }
}

enum CategorySearchTiming {
  static let debounce = Duration.milliseconds(300)
}
