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
      .sheet(isPresented: $isEditingTitle) { EditStreamInfoSheet(initial: store.proposedInfo) }
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
