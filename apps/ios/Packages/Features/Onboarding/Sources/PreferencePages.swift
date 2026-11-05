import DesignSystem
import Domain
import Preferences
import SwiftUI

struct ContentPreferencesPage: View {
  @Environment(PreferencesStore.self) private var preferences
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let choices = PreferenceChoices(preferences: preferences)
    JourneyPage(
      title: PersonalizationText.contentTitle,
      message: PersonalizationText.contentMessage,
      primary: PersonalizationText.next,
      selectionCount: choices.contentSelectionCount
    ) {
      ScrollView {
        VStack(alignment: .leading, spacing: LayoutRole.editSectionGap.points) {
          EditSection(label: PersonalizationText.contentSection, footer: PersonalizationText.contentFooter) {
            ForEach(Array(ContentLabel.allCases.enumerated()), id: \.element) { index, label in
              if index > 0 {
                JourneyChoiceDivider()
              }
              JourneyToggleRow(
                title: PersonalizationText.hide(label),
                isOn: Binding(get: { choices.isHidden(label) }, set: { choices.hide(label, $0) })
                  .animation(JourneyMotion.selection(reduceMotion: reduceMotion))
              )
              .accessibilityIdentifier("journey.content.\(label.rawValue)")
            }
          }
          VStack(alignment: .leading, spacing: LayoutRole.editSectionLabelGap.points) {
            JourneyChoiceCard {
              JourneyToggleRow(
                title: PersonalizationText.blurTitle,
                isOn: Binding(get: { choices.isBlurring }, set: { choices.blur($0) })
              )
              .disabled(!choices.isBlurAvailable)
              .accessibilityIdentifier("journey.content.blur")
            }
            Text(PersonalizationText.blurFooter)
              .font(TextRole.editSectionFooter.font)
              .foregroundStyle(EditProfileStyle.sectionFooter.color)
              .padding(.horizontal, LayoutRole.menuRowPadding.points)
          }
        }
      }
      .scrollIndicators(.hidden)
    }
  }
}

struct LiveLanguagePage: View {
  @Environment(PreferencesStore.self) private var preferences
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let choices = PreferenceChoices(preferences: preferences)
    JourneyPage(
      title: PersonalizationText.languageTitle,
      message: PersonalizationText.languageMessage,
      primary: PersonalizationText.next,
      selectionCount: 1
    ) {
      ScrollView {
        JourneyChoiceCard {
          ForEach(Array(LiveLanguage.allCases.enumerated()), id: \.element) { index, language in
            if index > 0 {
              JourneyChoiceDivider()
            }
            Button {
              withAnimation(JourneyMotion.selection(reduceMotion: reduceMotion)) {
                choices.choose(language)
              }
            } label: {
              JourneyCheckRow(
                title: PersonalizationText.languageName(language),
                isSelected: choices.language == language
              )
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("journey.language.\(language.rawValue)")
          }
        }
      }
      .scrollIndicators(.hidden)
    }
  }
}
