import DesignSystem
import Domain
import SwiftUI

public struct EditStreamInfoSheet: View {
  @Environment(MyChannelStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var draft: StreamInfo
  @State private var tagEntry = ""
  @State private var isSaving = false
  @State private var saveFailed = false

  public init(initial: StreamInfo) {
    _draft = State(initialValue: initial)
  }

  public var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: LayoutRole.editSectionGap.points) {
          titleSection
          notificationSection
          CategoryField(chosen: $draft.category)
          tagsSection
          classificationSection
          languageSection
          brandedSection
          markersSection
          shareRow
        }
        .padding(LayoutRole.screenInset.points)
      }
      .scrollDismissesKeyboard(.interactively)
      .background(ColorRole.background.color.ignoresSafeArea())
      .navigationTitle(Text(StreamInfoText.navigationTitle))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button { dismiss() } label: { Text(StreamInfoText.cancel) }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button { save() } label: { Text(StreamInfoText.save) }
            .disabled(isSaving || MyChannelStore.remaining(in: draft.title) < 0)
            .accessibilityIdentifier("editStreamInfo.done")
        }
      }
    }
  }

  private var titleSection: some View {
    section(StreamInfoText.title, remaining: MyChannelStore.remaining(in: draft.title)) {
      TextField(text: $draft.title) { Text(StreamInfoText.titlePlaceholder) }
        .modifier(StreamInfoField())
        .accessibilityIdentifier("editStreamInfo.title")
      if saveFailed {
        hint(ProfileText.notice(.titleFailed))
          .accessibilityIdentifier("editStreamInfo.notice")
      }
    }
  }

  private var notificationSection: some View {
    section(StreamInfoText.notifications, remaining: MyChannelStore.maxTitleLength) {
      TextField(text: .constant("")) { Text(StreamInfoText.notificationPlaceholder(channelName)) }
        .modifier(StreamInfoField())
        .disabled(true)
        .accessibilityIdentifier("editStreamInfo.notification")
      hint(StreamInfoText.notificationsHint)
    }
  }

  private var tagsSection: some View {
    section(StreamInfoText.tags) {
      TextField(text: $tagEntry) { Text(StreamInfoText.tagsPlaceholder) }
        .modifier(StreamInfoField())
        .autocorrectionDisabled()
        .textInputAutocapitalization(.never)
        .submitLabel(.done)
        .onSubmit(addTag)
        .accessibilityIdentifier("editStreamInfo.tagField")
      if !draft.tags.isEmpty {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: LayoutRole.categoryTagGap.points) {
            ForEach(draft.tags, id: \.self) { tag in
              Button { draft = draft.removing(tag: tag) } label: { CategoryTag(tag) }
                .accessibilityLabel(Text(StreamInfoText.removeTag(tag)))
            }
          }
        }
        .accessibilityIdentifier("editStreamInfo.tags")
      }
      hint(StreamInfoText.tagsHint)
    }
  }

  private var classificationSection: some View {
    section(StreamInfoText.classification) {
      Menu {
        ForEach(ContentLabel.allCases, id: \.self) { label in
          Toggle(isOn: labelBinding(label)) { Text(StreamInfoText.label(label)) }
        }
      } label: {
        HStack(spacing: LayoutRole.chatInset.points) {
          Text(classificationSummary)
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)
          Image(systemName: "chevron.down")
        }
        .modifier(StreamInfoField())
      }
      .accessibilityIdentifier("editStreamInfo.classification")
      hint(StreamInfoText.classificationHint)
    }
  }

  private var languageSection: some View {
    section(StreamInfoText.language) {
      Menu {
        Picker(selection: $draft.language) {
          ForEach(LiveLanguage.allCases, id: \.self) { language in
            Text(language.nativeName).tag(LiveLanguage?.some(language))
          }
        } label: {
          Text(StreamInfoText.language)
        }
      } label: {
        Text(draft.language?.nativeName ?? "")
          .frame(maxWidth: .infinity, alignment: .leading)
          .modifier(StreamInfoField())
      }
      .accessibilityIdentifier("editStreamInfo.language")
    }
  }

  private var brandedSection: some View {
    VStack(alignment: .leading, spacing: LayoutRole.chatInset.points) {
      Toggle(isOn: $draft.isBrandedContent) {
        Text(StreamInfoText.branded)
          .font(TextRole.display.font)
          .foregroundStyle(ColorRole.textPrimary.color)
      }
      .tint(ColorRole.accent.color)
      .padding(LayoutRole.composerPadding.points)
      .background(ColorRole.surface.color)
      .accessibilityIdentifier("editStreamInfo.branded")
      hint(StreamInfoText.brandedHint)
    }
  }

  private var markersSection: some View {
    section(StreamInfoText.markers, remaining: MyChannelStore.maxTitleLength) {
      TextField(text: .constant("")) { Text(StreamInfoText.markersPlaceholder) }
        .modifier(StreamInfoField())
        .disabled(true)
      Button {} label: {
        Text(StreamInfoText.addMarker)
          .font(TextRole.display.font)
          .frame(maxWidth: .infinity)
      }
      .disabled(true)
      .padding(.top, LayoutRole.chatInset.points)
      .accessibilityIdentifier("editStreamInfo.addMarker")
    }
  }

  @ViewBuilder private var shareRow: some View {
    if let link = store.shareURL {
      HStack {
        Text(StreamInfoText.share)
          .font(TextRole.display.font)
          .foregroundStyle(ColorRole.textPrimary.color)
        Spacer(minLength: LayoutRole.chatInset.points)
        ShareLink(item: link) {
          Text(StreamInfoText.shareAction)
            .font(TextRole.display.font)
            .foregroundStyle(ColorRole.link.color)
        }
        .accessibilityIdentifier("editStreamInfo.share")
      }
    }
  }

  private var channelName: String {
    guard case let .ready(owned) = store.phase else { return "" }
    return owned.slug.rawValue
  }

  private var classificationSummary: String {
    let chosen = ContentLabel.allCases.filter(draft.contentLabels.contains)
    guard !chosen.isEmpty else { return String(localized: StreamInfoText.classificationPlaceholder) }
    return chosen.map { String(localized: StreamInfoText.label($0)) }.formatted(.list(type: .and))
  }

  private func labelBinding(_ label: ContentLabel) -> Binding<Bool> {
    Binding(
      get: { draft.contentLabels.contains(label) },
      set: { _ in draft = draft.toggling(label) }
    )
  }

  private func section(
    _ label: LocalizedStringResource,
    remaining: Int? = nil,
    @ViewBuilder content: () -> some View
  ) -> some View {
    VStack(alignment: .leading, spacing: LayoutRole.chatInset.points) {
      HStack {
        Text(label)
          .font(TextRole.display.font)
          .foregroundStyle(ColorRole.textPrimary.color)
        Spacer(minLength: 0)
        if let remaining {
          Text(StreamInfoText.remaining(remaining))
            .font(TextRole.body.font)
            .foregroundStyle(ColorRole.textSecondary.color)
        }
      }
      content()
    }
  }

  private func hint(_ text: LocalizedStringResource) -> some View {
    Text(text)
      .font(TextRole.fieldHint.font)
      .foregroundStyle(ColorRole.textSecondary.color)
  }

  private func addTag() {
    guard let added = draft.adding(tag: tagEntry) else { return }
    draft = added
    tagEntry = ""
  }

  private func save() {
    isSaving = true
    saveFailed = false
    Task {
      let saved = await store.save(draft)
      saveFailed = !saved
      isSaving = false
      if saved { dismiss() }
    }
  }
}

private struct StreamInfoField: ViewModifier {
  func body(content: Content) -> some View {
    content
      .font(TextRole.fieldText.font)
      .foregroundStyle(ColorRole.textPrimary.color)
      .padding(LayoutRole.composerPadding.points)
      .background(ColorRole.surfaceSecondary.color, in: RoundedRectangle(cornerRadius: LayoutRole.composerRadius.points))
  }
}
