import Domain
import Foundation
import Profile
import Testing

private actor Requests {
  private(set) var count = 0

  func record() {
    count += 1
  }
}

private struct FakeCamera: CameraAccess {
  let current: CameraStatus
  let grants: Bool
  let requests: Requests

  func status() -> CameraStatus {
    current
  }

  func requestAccess() async -> Bool {
    await requests.record()
    return grants
  }
}

private struct NoUploads: ImageUploads {
  func prepare(_: ImageUploadRequest) async throws -> UploadTicket {
    throw ImageUploadError.rejected(status: 500)
  }

  func send(_: Data, with _: UploadTicket) async throws {}
}

private struct NoProfileImages: ProfileImages {
  func setAvatar(_: UploadID) async throws -> Account {
    throw ImageUploadError.rejected(status: 500)
  }

  func setBanner(_: UploadID) async throws -> Channel {
    throw ImageUploadError.rejected(status: 500)
  }
}

@MainActor
private func makeStore(_ status: CameraStatus, grants: Bool = false, requests: Requests = Requests()) -> ProfileImageStore {
  ProfileImageStore(
    uploads: NoUploads(),
    images: NoProfileImages(),
    camera: FakeCamera(current: status, grants: grants, requests: requests)
  )
}

@MainActor
@Suite("Edit Profile : Take photo ouvre l'appareil photo, ou dit pourquoi il ne s'ouvre pas")
struct ProfileCameraTests {
  @Test("l'appareil photo autorisé s'ouvre sans rien demander", arguments: [ImagePurpose.avatar, .banner])
  func allowed(purpose: ImagePurpose) async {
    let requests = Requests()
    let store = makeStore(.allowed, requests: requests)

    #expect(await store.canTakePhoto(purpose))
    #expect(store.phase == .idle)
    #expect(await requests.count == 0)
  }

  @Test("à la première fois, l'accès est demandé et l'appareil s'ouvre s'il est accordé")
  func grantedOnFirstAsk() async {
    let requests = Requests()
    let store = makeStore(.undetermined, grants: true, requests: requests)

    #expect(await store.canTakePhoto(.avatar))
    #expect(store.phase == .idle)
    #expect(await requests.count == 1)
  }

  @Test("un accès refusé à la demande ne l'ouvre pas et le dit")
  func deniedOnFirstAsk() async {
    let store = makeStore(.undetermined, grants: false)

    #expect(await store.canTakePhoto(.avatar) == false)
    #expect(store.phase == .failed(.avatar, .cameraRefused))
  }

  @Test("un accès déjà refusé ne redemande rien et le dit", arguments: [ImagePurpose.avatar, .banner])
  func alreadyRefused(purpose: ImagePurpose) async {
    let requests = Requests()
    let store = makeStore(.refused, requests: requests)

    #expect(await store.canTakePhoto(purpose) == false)
    #expect(store.phase == .failed(purpose, .cameraRefused))
    #expect(await requests.count == 0)
  }

  @Test("un appareil sans caméra ne l'ouvre pas et le dit")
  func missing() async {
    let requests = Requests()
    let store = makeStore(.missing, requests: requests)

    #expect(await store.canTakePhoto(.banner) == false)
    #expect(store.phase == .failed(.banner, .cameraMissing))
    #expect(await requests.count == 0)
  }
}
