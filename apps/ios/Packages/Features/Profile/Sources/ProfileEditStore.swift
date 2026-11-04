import Domain
import Observation

@MainActor
@Observable
public final class ProfileEditStore {
  public private(set) var isSaving = false
  public private(set) var hasFailed = false

  private let editor: any ProfileEditor

  public init(editor: any ProfileEditor) {
    self.editor = editor
  }

  public func saveBio(_ text: String) async -> Account? {
    guard Bio.fits(text), !isSaving else { return nil }
    isSaving = true
    hasFailed = false
    defer { isSaving = false }
    do {
      return try await editor.updateBio(text)
    } catch {
      hasFailed = true
      return nil
    }
  }

  public func dismissFailure() {
    hasFailed = false
  }
}
