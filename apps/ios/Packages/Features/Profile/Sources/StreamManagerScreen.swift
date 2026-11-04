import DesignSystem
import Domain
import SwiftUI

struct StreamManagerScreen: View {
  @Environment(MyChannelStore.self) private var store

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: LayoutRole.menuCardGap.points) {
        switch store.phase {
        case .loading:
          ProgressView().frame(maxWidth: .infinity)
        case .noChannel:
          message(ProfileText.noChannel)
        case .failed:
          message(ProfileText.failed)
          Button(ProfileText.retry) { Task { await store.load() } }
            .buttonStyle(ActionButtonStyle(.secondary))
        case .ready:
          titleCard
          keyCard
          obsCard
          if let notice = store.notice {
            message(ProfileText.notice(notice))
              .accessibilityIdentifier("streamManager.notice")
          }
        }
      }
      .padding(LayoutRole.screenInset.points)
    }
    .background(ColorRole.background.color.ignoresSafeArea())
    .navigationTitle(Text(ProfileText.streamManager))
    .navigationBarTitleDisplayMode(.inline)
    .onDisappear { store.leave() }
  }

  private var titleCard: some View {
    MenuCard {
      field(ProfileText.title) {
        Text(store.title)
          .accessibilityIdentifier("streamManager.channelTitle")
        Spacer(minLength: 0)
      }
    }
  }

  private var keyCard: some View {
    MenuCard {
      field(ProfileText.streamKey) {
        Text(store.streamKey?.revealed ?? ProfileText.masked)
          .textSelection(.disabled)
          .accessibilityIdentifier("streamManager.streamKey")
        Spacer(minLength: 0)
        if store.streamKey == nil {
          Button(ProfileText.show) { Task { await store.revealKey() } }
            .accessibilityIdentifier("streamManager.showKey")
        } else {
          Button(ProfileText.copy) { store.copyKey() }
            .accessibilityIdentifier("streamManager.copyKey")
          Button(ProfileText.hide) { store.hideKey() }
        }
      }
      if let ingestURL = store.streamKey?.ingestURL {
        field(ProfileText.server) {
          Text(ingestURL.absoluteString)
          Spacer(minLength: 0)
        }
      }
    }
  }

  private var obsCard: some View {
    VStack(alignment: .leading, spacing: LayoutRole.chatInset.points) {
      Text(ProfileText.obs)
        .font(TextRole.display.font)
        .foregroundStyle(ColorRole.textPrimary.color)
      MenuCard {
        ForEach(Array(ProfileText.obsSettings.enumerated()), id: \.offset) { _, setting in
          field(setting.label) {
            Text(setting.value)
            Spacer(minLength: 0)
          }
        }
      }
    }
  }

  private func field(
    _ label: LocalizedStringResource,
    @ViewBuilder content: () -> some View
  ) -> some View {
    VStack(alignment: .leading, spacing: LayoutRole.heroRowGap.points) {
      Text(label)
        .font(TextRole.body.font)
        .foregroundStyle(ColorRole.textSecondary.color)
      HStack(spacing: LayoutRole.chatInset.points) { content() }
        .font(TextRole.display.font)
        .foregroundStyle(ColorRole.textPrimary.color)
    }
    .padding(.horizontal, LayoutRole.menuRowPadding.points)
    .frame(maxWidth: .infinity, minHeight: LayoutRole.menuRowHeight.points, alignment: .leading)
  }

  private func message(_ text: LocalizedStringResource) -> some View {
    Text(text)
      .font(TextRole.body.font)
      .foregroundStyle(ColorRole.textSecondary.color)
  }
}
