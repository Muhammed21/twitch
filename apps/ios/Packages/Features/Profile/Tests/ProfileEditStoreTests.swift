import Domain
import Foundation
import Profile
import Testing

private struct EditorDown: Error {}

private let viewer = Account(
  id: UUID(uuidString: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b") ?? UUID(),
  name: "alexsmithmobbin",
  email: "viewer@twitch.local"
)

private actor FakeEditor: ProfileEditor {
  private(set) var sent: [String] = []
  private let fails: Bool

  init(fails: Bool = false) {
    self.fails = fails
  }

  func updateBio(_ bio: String) async throws -> Account {
    sent.append(bio)
    if fails { throw EditorDown() }
    return Account(id: viewer.id, name: viewer.name, email: viewer.email, bio: bio.isEmpty ? nil : bio)
  }
}

@MainActor
@Suite("Edit Profile : la bio enregistrée par PATCH /v1/me")
struct ProfileEditStoreTests {
  @Test("enregistrer la bio rend le compte mis à jour")
  func savesBio() async {
    let editor = FakeEditor()
    let store = ProfileEditStore(editor: editor)

    let saved = await store.saveBio("i love do gaming stream")

    #expect(saved?.bio == "i love do gaming stream")
    #expect(!store.hasFailed)
    #expect(!store.isSaving)
    #expect(await editor.sent == ["i love do gaming stream"])
  }

  @Test("un échec ne rend aucun compte et le signale")
  func failure() async {
    let store = ProfileEditStore(editor: FakeEditor(fails: true))

    let saved = await store.saveBio("i love do gaming stream")

    #expect(saved == nil)
    #expect(store.hasFailed)
    #expect(!store.isSaving)
  }

  @Test("une bio de plus de 300 caractères n'est pas envoyée")
  func tooLong() async {
    let editor = FakeEditor()
    let store = ProfileEditStore(editor: editor)

    let saved = await store.saveBio(String(repeating: "a", count: 301))

    #expect(saved == nil)
    #expect(await editor.sent.isEmpty)
  }

  @Test("refermer le message d'échec l'efface")
  func dismissFailure() async {
    let store = ProfileEditStore(editor: FakeEditor(fails: true))
    _ = await store.saveBio("i love do gaming stream")
    store.dismissFailure()

    #expect(!store.hasFailed)
  }
}
