import Domain
import Foundation
import Profile
import Testing

private struct ImagesDown: Error {}

private let uploadID = UploadID(UUID(uuidString: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d") ?? UUID())
private let viewer = Account(id: UUID(uuidString: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b") ?? UUID(), name: "alexsmithmobbin", email: "viewer@twitch.local")
private func makeChannel() throws -> Channel {
  try Channel(
    id: ChannelID(#require(UUID(uuidString: "0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d"))),
    slug: ChannelSlug("alexsmithmobbin"),
    title: "Speedrun",
    ownerID: viewer.id
  )
}

private enum Step: Equatable {
  case prepare(ImageUploadRequest)
  case send(Int)
  case avatar(UploadID)
  case banner(UploadID)
}

private actor Journal {
  private(set) var steps: [Step] = []

  func record(_ step: Step) {
    steps.append(step)
  }
}

private struct FakeUploads: ImageUploads {
  let journal: Journal
  let failsSending: Bool

  func prepare(_ request: ImageUploadRequest) async throws -> UploadTicket {
    await journal.record(.prepare(request))
    return UploadTicket(id: uploadID, url: URL(fileURLWithPath: "/"), headers: [:])
  }

  func send(_ data: Data, with _: UploadTicket) async throws {
    await journal.record(.send(data.count))
    if failsSending { throw ImageUploadError.rejected(status: 403) }
  }
}

private struct FakeProfileImages: ProfileImages {
  let journal: Journal
  let failsConfirming: Bool
  let channel: Channel

  func setAvatar(_ upload: UploadID) async throws -> Account {
    await journal.record(.avatar(upload))
    if failsConfirming { throw ImagesDown() }
    return viewer
  }

  func setBanner(_ upload: UploadID) async throws -> Channel {
    await journal.record(.banner(upload))
    if failsConfirming { throw ImagesDown() }
    return channel
  }
}

@MainActor
private func makeStore(
  _ journal: Journal,
  failsSending: Bool = false,
  failsConfirming: Bool = false,
  prepared: PreparedImage? = nil
) throws -> ProfileImageStore {
  try ProfileImageStore(
    uploads: FakeUploads(journal: journal, failsSending: failsSending),
    images: FakeProfileImages(journal: journal, failsConfirming: failsConfirming, channel: makeChannel()),
    prepare: { picked, _ in prepared ?? .jpeg(picked) }
  )
}

@MainActor
@Suite("Edit Profile : photo de profil et bannière envoyées, puis confirmées")
struct ProfileImageStoreTests {
  @Test("la photo de profil est préparée en JPEG, déposée, puis confirmée par PUT /v1/me/avatar")
  func avatar() async throws {
    let journal = Journal()
    let store = try makeStore(journal)

    let saved = await store.setAvatar(Data(repeating: 0xFF, count: 2048))

    #expect(saved == viewer)
    #expect(store.phase == .idle)
    #expect(await journal.steps == [
      .prepare(ImageUploadRequest(purpose: .avatar, type: .jpeg, byteSize: 2048)),
      .send(2048),
      .avatar(uploadID),
    ])
  }

  @Test("la bannière est préparée en JPEG, déposée, puis confirmée par PUT /v1/me/banner")
  func banner() async throws {
    let journal = Journal()
    let store = try makeStore(journal)

    let saved = await store.setBanner(Data(repeating: 0xFF, count: 4096))

    #expect(try saved == makeChannel())
    #expect(await journal.steps == [
      .prepare(ImageUploadRequest(purpose: .banner, type: .jpeg, byteSize: 4096)),
      .send(4096),
      .banner(uploadID),
    ])
  }

  @Test("une image de 10 Mo ou plus est refusée sans rien envoyer, comme l'annonce « less than 10MB »")
  func tooLarge() async throws {
    let journal = Journal()
    let store = try makeStore(journal)

    let saved = await store.setAvatar(Data(count: ProfileImageStore.maxBytes))

    #expect(saved == nil)
    #expect(store.phase == .failed(.avatar, .tooLarge))
    #expect(await journal.steps.isEmpty)
  }

  @Test("une image sous le minimum de l'API est refusée sans rien envoyer", arguments: [ImagePurpose.avatar, .banner])
  func tooSmall(purpose: ImagePurpose) async throws {
    let journal = Journal()
    let store = try makeStore(journal, prepared: .tooSmall)

    switch purpose {
    case .avatar: _ = await store.setAvatar(Data([0x01]))
    case .banner: _ = await store.setBanner(Data([0x01]))
    }

    #expect(store.phase == .failed(purpose, .tooSmall))
    #expect(await journal.steps.isEmpty)
  }

  @Test("une image illisible s'annonce comme un échec, sans rien envoyer")
  func unreadable() async throws {
    let journal = Journal()
    let store = try makeStore(journal, prepared: .unreadable)

    let saved = await store.setAvatar(Data([0x01]))

    #expect(saved == nil)
    #expect(store.phase == .failed(.avatar, .notSaved))
    #expect(await journal.steps.isEmpty)
  }

  @Test("une photo que la photothèque ne rend pas s'annonce comme un échec")
  func pickFailed() throws {
    let store = try makeStore(Journal())

    store.pickFailed(.banner)

    #expect(store.phase == .failed(.banner, .notSaved))
  }

  @Test("seul un envoi en cours bloque les deux lignes", arguments: [
    (ProfileImageStore.Phase.idle, false),
    (.sending(.avatar), true),
    (.sending(.banner), true),
    (.failed(.avatar, .notSaved), false),
  ])
  func blocksRows(phase: ProfileImageStore.Phase, expected: Bool) {
    #expect(phase.isSending == expected)
  }

  @Test("un dépôt refusé n'est pas confirmé et laisse l'échec affiché")
  func uploadFails() async throws {
    let journal = Journal()
    let store = try makeStore(journal, failsSending: true)

    let saved = await store.setBanner(Data([0x01]))

    #expect(saved == nil)
    #expect(store.phase == .failed(.banner, .notSaved))
    #expect(await journal.steps.contains(.banner(uploadID)) == false)
  }

  @Test("une confirmation refusée laisse l'échec affiché ; refermer le message revient au repos")
  func confirmationFails() async throws {
    let store = try makeStore(Journal(), failsConfirming: true)

    let saved = await store.setAvatar(Data([0x01]))
    let failed = store.phase
    store.dismissFailure()

    #expect(saved == nil)
    #expect(failed == .failed(.avatar, .notSaved))
    #expect(store.phase == .idle)
  }
}
