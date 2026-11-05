import DesignSystem
import Domain
import Preferences
import SwiftUI

struct AppearancePage: View {
  @Environment(PreferencesStore.self) private var preferences
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let choices = SettingChoices(preferences: preferences)
    JourneyPage(
      title: PersonalizationText.appearanceTitle,
      message: PersonalizationText.appearanceMessage,
      primary: PersonalizationText.next,
      selectionCount: 1
    ) {
      EditSection(label: PersonalizationText.themeSection) {
        JourneyToggleRow(
          title: PersonalizationText.matchSystemTheme,
          isOn: Binding(
            get: { choices.matchesSystem },
            set: { choices.matchSystem($0, isShowingDark: colorScheme == .dark) }
          )
          .animation(JourneyMotion.selection(reduceMotion: reduceMotion))
        )
        .accessibilityIdentifier("journey.appearance.system")
        if !choices.matchesSystem {
          JourneyChoiceDivider()
          JourneyToggleRow(
            title: PersonalizationText.darkTheme,
            isOn: Binding(get: { choices.isDark }, set: { choices.dark($0) })
          )
          .accessibilityIdentifier("journey.appearance.dark")
        }
      }
    }
  }
}

struct VideoAutoplayPage: View {
  @Environment(PreferencesStore.self) private var preferences
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let choices = SettingChoices(preferences: preferences)
    JourneyPage(
      title: PersonalizationText.autoplayTitle,
      message: PersonalizationText.autoplayMessage,
      primary: PersonalizationText.next,
      selectionCount: 1
    ) {
      JourneyChoiceCard {
        ForEach(Array(VideoAutoplay.allCases.enumerated()), id: \.element) { index, autoplay in
          if index > 0 {
            JourneyChoiceDivider()
          }
          Button {
            withAnimation(JourneyMotion.selection(reduceMotion: reduceMotion)) {
              choices.choose(autoplay)
            }
          } label: {
            JourneyCheckRow(title: PersonalizationText.autoplay(autoplay), isSelected: choices.autoplay == autoplay)
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("journey.autoplay.\(autoplay.rawValue)")
        }
      }
    }
  }
}

struct ChatSettingsPage: View {
  @Environment(PreferencesStore.self) private var preferences
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    let choices = SettingChoices(preferences: preferences)
    JourneyPage(
      title: PersonalizationText.chatTitle,
      message: PersonalizationText.chatMessage,
      primary: PersonalizationText.next,
      selectionCount: 1
    ) {
      VStack(alignment: .leading, spacing: LayoutRole.editSectionGap.points) {
        EditSection(label: PersonalizationText.chatTextSizeSection) {
          ForEach(Array(ChatTextSize.allCases.enumerated()), id: \.element) { index, size in
            if index > 0 {
              JourneyChoiceDivider()
            }
            Button {
              withAnimation(JourneyMotion.selection(reduceMotion: reduceMotion)) {
                choices.choose(size)
              }
            } label: {
              JourneyCheckRow(title: PersonalizationText.chatTextSize(size), isSelected: choices.chatTextSize == size)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("journey.chat.\(size.rawValue)")
          }
        }
        JourneyChoiceCard {
          JourneyToggleRow(
            title: PersonalizationText.chatTimestamps,
            isOn: Binding(get: { choices.showsTimestamps }, set: { choices.showTimestamps($0) })
          )
          .accessibilityIdentifier("journey.chat.timestamps")
        }
      }
    }
  }
}
