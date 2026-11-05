import DesignSystem
import Domain
import SwiftUI

struct EditProfileSheet: View {
  @Environment(\.dismiss) private var dismiss
  @State private var account: Account
  @State private var hasChanges = false
  private let onSaved: (Account) -> Void

  init(account: Account, onSaved: @escaping (Account) -> Void) {
    _account = State(initialValue: account)
    self.onSaved = onSaved
  }

  var body: some View {
    NavigationStack {
      ScrollView {
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
