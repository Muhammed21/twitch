import DesignSystem
import Domain
import SwiftUI

struct NotificationsPage: View {
  @Environment(PersonalizationJourney.self) private var journey
  @Environment(NotificationChoices.self) private var choices
  @State private var isAsking = false

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0)
      GlitchMark()
        .frame(width: LayoutRole.journeyHeroWidth.points)
      Text(PersonalizationText.notificationsTitle)
        .font(TextRole.journeyTitle.font)
        .foregroundStyle(JourneyStyle.title.color)
        .accessibilityAddTraits(.isHeader)
        .accessibilityFocusOnAppear()
        .padding(.top, LayoutRole.journeyContentGap.points)
      Spacer(minLength: 0)
      Button(PersonalizationText.turnOnNotifications) {
        isAsking = true
        Task {
          let answer = await choices.turnOn()
          journey.complete(selectionCount: answer == .granted ? 1 : 0)
        }
      }
      .buttonStyle(ActionButtonStyle(.primary))
      .disabled(isAsking)
      .accessibilityIdentifier("journey.notifications.turnOn")
      Button(PersonalizationText.remindMeLater) { journey.skip() }
        .font(TextRole.journeyControl.font)
        .foregroundStyle(JourneyStyle.skip.color)
        .frame(minHeight: LayoutRole.actionHeight.points)
        .padding(.top, LayoutRole.journeyMessageGap.points)
        .disabled(isAsking)
        .accessibilityIdentifier("journey.notifications.later")
      Text(PersonalizationText.notificationsFooter)
        .font(TextRole.editSectionFooter.font)
        .foregroundStyle(JourneyStyle.message.color)
        .padding(.top, LayoutRole.journeyMessageGap.points)
    }
    .multilineTextAlignment(.center)
    .padding([.horizontal, .bottom], LayoutRole.screenInset.points)
    .task {
      await choices.load()
      guard let authorization = choices.authorization else { return }
      switch NotificationPass(authorization: authorization, direction: journey.direction) {
      case .skip: journey.skip()
      case .back: journey.back()
      case nil: break
      }
    }
  }
}
