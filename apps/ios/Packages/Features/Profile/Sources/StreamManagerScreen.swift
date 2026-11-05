import DesignSystem
import Domain
import SwiftUI

public struct StreamManagerScreen: View {
  @Environment(MyChannelStore.self) private var store
  @State private var isEditingTitle = false
  @State private var isConfirmingReset = false
  @State private var widget = StreamManagerWidget.initial
  private let onClose: (() -> Void)?

  public init(onClose: (() -> Void)? = nil) {
    self.onClose = onClose
  }

  public var body: some View {
    content
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
      .sheet(isPresented: $isEditingTitle) { EditStreamInfoSheet(initialTitle: store.title, initialCategory: store.category) }
      .alert(Text(ProfileText.resetKeyTitle), isPresented: $isConfirmingReset) {
        Button(role: .destructive) {
          Task { await store.rotateKey() }
        } label: {
          Text(ProfileText.resetKey)
        }
        Button(role: .cancel) {} label: { Text(ProfileText.cancel) }
      } message: {
        Text(ProfileText.resetKeyMessage)
      }
  }

  @ViewBuilder private var content: some View {
    switch store.phase {
    case .loading:
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    case .noChannel:
      message(ProfileText.noChannel)
        .padding(LayoutRole.screenInset.points)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    case .failed:
      VStack(alignment: .leading, spacing: LayoutRole.menuCardGap.points) {
        message(ProfileText.failed)
        Button(ProfileText.retry) { Task { await store.load() } }
          .buttonStyle(ActionButtonStyle(.secondary))
      }
      .padding(LayoutRole.screenInset.points)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    case .ready:
      widgets
    }
  }

  private var widgets: some View {
    VStack(spacing: LayoutRole.widgetGap.points) {
      StreamPreview()
        .padding(.horizontal, LayoutRole.widgetInset.points)
      TabView(selection: $widget) {
        ForEach(StreamManagerWidget.allCases, id: \.self) { widget in
          WidgetCard(title: String(localized: widget.title)) { widgetContent(widget) }
            .padding(.horizontal, LayoutRole.widgetInset.points)
            .tag(widget)
        }
      }
      .tabViewStyle(.page(indexDisplayMode: .never))
      if let notice = store.notice {
        message(ProfileText.notice(notice))
          .padding(.horizontal, LayoutRole.widgetInset.points)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityIdentifier("streamManager.notice")
      }
      WidgetDock(selection: $widget, items: Self.dock)
    }
    .padding(.bottom, LayoutRole.widgetGap.points)
  }

  private static let dock = StreamManagerWidget.allCases.map {
    WidgetDockItem(
      widget: $0,
      label: String(localized: $0.title),
      systemImage: $0.systemImage,
      accessibilityIdentifier: $0.accessibilityIdentifier
    )
  }

  @ViewBuilder private func widgetContent(_ widget: StreamManagerWidget) -> some View {
    switch widget {
    case .streamInfo: titleCard
    case .streamKey: keyCard
    case .obs: obsCard
    }
  }

  private var titleCard: some View {
    VStack(alignment: .leading, spacing: 0) {
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
    VStack(alignment: .leading, spacing: 0) {
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
        Button(ProfileText.resetKey) { isConfirmingReset = true }
          .accessibilityIdentifier("streamManager.resetKey")
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
    VStack(alignment: .leading, spacing: 0) {
      ForEach(Array(ProfileText.obsSettings.enumerated()), id: \.offset) { _, setting in
        field(setting.label) {
          Text(setting.value)
          Spacer(minLength: 0)
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

public struct EditStreamInfoSheet: View {
  @Environment(MyChannelStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var draft: String
  @State private var chosen: ChannelCategory?
  @State private var isSaving = false
  @State private var saveFailed = false

  public init(initialTitle: String, initialCategory: ChannelCategory?) {
    _draft = State(initialValue: initialTitle)
    _chosen = State(initialValue: initialCategory)
  }

  public var body: some View {
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
        CategoryField(chosen: $chosen)
          .padding(.top, LayoutRole.screenInset.points)
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
      var info = store.info
      info.title = draft
      info.category = chosen
      let saved = await store.save(info)
      saveFailed = !saved
      isSaving = false
      if saved { dismiss() }
    }
  }
}
