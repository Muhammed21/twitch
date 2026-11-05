import DesignSystem
import Domain
import PhotosUI
import SwiftUI
import UIKit

struct EditProfileSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(ProfileImageStore.self) private var images: ProfileImageStore?
  @Environment(MyChannelStore.self) private var channel
  @State private var account: Account
  @State private var hasChanges = false
  @State private var menu: ImagePurpose?
  @State private var target: ImagePurpose?
  @State private var isPicking = false
  @State private var selection: PhotosPickerItem?
  @State private var avatar: Image?
  @State private var banner: Image?
  private let onSaved: (Account) -> Void

  init(account: Account, onSaved: @escaping (Account) -> Void) {
    _account = State(initialValue: account)
    self.onSaved = onSaved
  }

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: LayoutRole.editSectionGap.points) {
          if let images { brand(images) }
          about
        }
        .padding(LayoutRole.screenInset.points)
      }
      .background(ColorRole.background.color.ignoresSafeArea())
      .navigationTitle(Text(EditProfileText.title))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button(ProfileText.cancel) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(ProfileText.done) { dismiss() }
            .disabled(!hasChanges)
            .accessibilityIdentifier("editProfile.done")
        }
      }
      .confirmationDialog(
        Text(EditProfileText.picture),
        isPresented: Binding(get: { menu != nil }, set: { if !$0 { menu = nil } }),
        titleVisibility: .hidden,
        presenting: menu
      ) { purpose in
        Button(String(localized: EditProfileText.chooseExisting)) {
          target = purpose
          isPicking = true
        }
        .accessibilityIdentifier("editProfile.photo.choose")
        Button(String(localized: EditProfileText.close), role: .cancel) {}
      }
      .photosPicker(isPresented: $isPicking, selection: $selection, matching: .images)
      .onChange(of: selection) { _, item in
        guard let item, let purpose = target, let images else { return }
        selection = nil
        Task { await send(item, as: purpose, through: images) }
      }
    }
  }

  private func brand(_ images: ProfileImageStore) -> some View {
    VStack(alignment: .leading, spacing: LayoutRole.editSectionLabelGap.points) {
      EditSection(label: String(localized: EditProfileText.brand), footer: String(localized: EditProfileText.brandFooter)) {
        BrandPreview(
          avatar: BrandPicture(local: avatar, url: account.avatarURL),
          banner: BrandPicture(local: banner, url: channel.bannerURL),
          isSendingAvatar: images.phase == .sending(.avatar),
          isSendingBanner: images.phase == .sending(.banner)
        )
        imageRow(.avatar, title: EditProfileText.picture, hint: EditProfileText.pictureHint, images: images)
        imageRow(.banner, title: EditProfileText.banner, hint: EditProfileText.bannerHint, images: images)
      }
      if let notice = EditProfileText.notice(for: images.phase) {
        Text(notice)
          .font(TextRole.body.font)
          .foregroundStyle(ColorRole.textSecondary.color)
          .accessibilityIdentifier("editProfile.image.notice")
      }
    }
  }

  private func imageRow(
    _ purpose: ImagePurpose,
    title: LocalizedStringResource,
    hint: LocalizedStringResource,
    images: ProfileImageStore
  ) -> some View {
    Button {
      images.dismissFailure()
      menu = purpose
    } label: {
      EditRow(title: String(localized: title), value: String(localized: hint), accessory: .edit)
    }
    .buttonStyle(.plain)
    .disabled(images.phase == .sending(purpose))
    .accessibilityIdentifier(purpose == .avatar ? "editProfile.picture" : "editProfile.banner")
  }

  private var about: some View {
    EditSection(label: String(localized: EditProfileText.about)) {
      NavigationLink {
        BioScreen(initialBio: account.bio ?? "") { saved in
          account = saved
          hasChanges = true
          onSaved(saved)
        }
      } label: {
        EditRow(
          title: String(localized: EditProfileText.bio),
          value: account.bio ?? String(localized: EditProfileText.bioPlaceholder)
        )
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("editProfile.bio")
    }
  }

  private func send(_ item: PhotosPickerItem, as purpose: ImagePurpose, through images: ProfileImageStore) async {
    guard
      let data = try? await item.loadTransferable(type: Data.self),
      let jpeg = ProfileImageEncoding.jpeg(from: data)
    else { return }
    let preview = UIImage(data: jpeg).map { Image(uiImage: $0) }
    switch purpose {
    case .avatar:
      guard let saved = await images.setAvatar(jpeg) else { return }
      account = saved
      avatar = preview
      hasChanges = true
      onSaved(saved)
    case .banner:
      guard let saved = await images.setBanner(jpeg) else { return }
      channel.bannerSaved(saved)
      banner = preview
      hasChanges = true
    }
  }
}

struct BioScreen: View {
  @Environment(ProfileEditStore.self) private var store
  @Environment(\.dismiss) private var dismiss
  @State private var draft: String
  private let onSaved: (Account) -> Void

  init(initialBio: String, onSaved: @escaping (Account) -> Void) {
    _draft = State(initialValue: initialBio)
    self.onSaved = onSaved
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      TextField(text: $draft, axis: .vertical) { Text(EditProfileText.bioPlaceholder) }
        .font(TextRole.bioText.font)
        .foregroundStyle(ColorRole.textPrimary.color)
        .padding(.horizontal, LayoutRole.bioFieldPadding.points)
        .padding(.bottom, LayoutRole.bioFieldBottom.points)
        .accessibilityIdentifier("bio.field")
      Rectangle()
        .fill(EditProfileStyle.divider.color)
        .frame(height: LayoutRole.bioFieldDividerHeight.points)
      if store.hasFailed {
        Text(EditProfileText.bioFailed)
          .font(TextRole.body.font)
          .foregroundStyle(ColorRole.textSecondary.color)
          .padding(.top, LayoutRole.bioFieldBottom.points)
          .accessibilityIdentifier("bio.notice")
      }
      Spacer(minLength: 0)
      Text(EditProfileText.remaining(Bio.remaining(in: draft)))
        .font(TextRole.bioCounter.font)
        .foregroundStyle(ColorRole.textSecondary.color)
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(.trailing, LayoutRole.bioCounterInset.points - LayoutRole.screenInset.points)
        .padding(.bottom, LayoutRole.bioCounterInset.points)
        .accessibilityIdentifier("bio.remaining")
    }
    .padding(.horizontal, LayoutRole.screenInset.points)
    .padding(.top, LayoutRole.screenInset.points)
    .background(ColorRole.background.color.ignoresSafeArea())
    .navigationTitle(Text(EditProfileText.bio))
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button(ProfileText.done) { save() }
          .disabled(store.isSaving || !Bio.fits(draft))
          .accessibilityIdentifier("bio.done")
      }
    }
    .onDisappear { store.dismissFailure() }
  }

  private func save() {
    Task {
      guard let saved = await store.saveBio(draft) else { return }
      onSaved(saved)
      dismiss()
    }
  }
}
