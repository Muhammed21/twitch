import DesignSystem
import Domain
import SwiftUI

public struct StreamManagerScreen: View {
  @Environment(MyChannelStore.self) private var store
  @State private var isEditingTitle = false
  private let onClose: (() -> Void)?

  public init(onClose: (() -> Void)? = nil) {
    self.onClose = onClose
  }

  public var body: some View {
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
    .task { await store.loadIfNeeded() }
    .toolbar {
      if let onClose {
        ToolbarItem(placement: .topBarLeading) {
          Button(action: onClose) {
            Image(systemName: "xmark")
          }
          .accessibilityLabel(Text(ProfileText.close))
          .accessibilityIdentifier("streamManager.close")
        }
      }
    }
    .onDisappear { store.leave() }
    .sheet(isPresented: $isEditingTitle) { EditStreamInfoSheet(initialTitle: store.title) }
  }

  private var titleCard: some View {
    MenuCard {
      field(ProfileText.title) {
        Text(store.title)
          .accessibilityIdentifier("streamManager.channelTitle")
        Spacer(minLength: 0)
        Button(ProfileText.edit) { isEditingTitle = true }
          .accessibilityIdentifier("streamManager.editTitle")
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

struct EditStreamInfoSheet: View {
  @Environment(MyChannelStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var draft: String
  @State private var isSaving = false
  @State private var saveFailed = false

  init(initialTitle: String) {
    _draft = State(initialValue: initialTitle)
  }

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: LayoutRole.chatInset.points) {
        HStack {
          Text(ProfileText.title)
            .font(TextRole.display.font)
            .foregroundStyle(ColorRole.textPrimary.color)
          Spacer(minLength: 0)
          Text(ProfileText.remaining(MyChannelStore.remaining(in: draft)))
            .font(TextRole.body.font)
            .foregroundStyle(ColorRole.textSecondary.color)
        }
        TextField(text: $draft) { Text(ProfileText.title) }
          .padding(LayoutRole.composerPadding.points)
          .background(ColorRole.surfaceSecondary.color, in: RoundedRectangle(cornerRadius: LayoutRole.composerRadius.points))
          .accessibilityIdentifier("editStreamInfo.title")
        if saveFailed {
          Text(ProfileText.notice(.titleFailed))
            .font(TextRole.body.font)
            .foregroundStyle(ColorRole.textSecondary.color)
            .accessibilityIdentifier("editStreamInfo.notice")
        }
        Spacer(minLength: 0)
      }
      .padding(LayoutRole.screenInset.points)
      .background(ColorRole.background.color.ignoresSafeArea())
      .navigationTitle(Text(ProfileText.editStreamInfo))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(ProfileText.cancel) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(ProfileText.done) { save() }
            .disabled(isSaving || MyChannelStore.remaining(in: draft) < 0)
            .accessibilityIdentifier("editStreamInfo.done")
        }
      }
    }
  }

  private func save() {
    isSaving = true
    saveFailed = false
    Task {
      let saved = await store.rename(to: draft)
      saveFailed = !saved
      isSaving = false
      if saved { dismiss() }
    }
  }
}
