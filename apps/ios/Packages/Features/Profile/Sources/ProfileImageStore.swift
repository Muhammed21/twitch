import Domain
import Foundation
import Observation

@MainActor
@Observable
public final class ProfileImageStore {
  public enum Failure: Equatable, Sendable {
    case tooLarge
    case notSaved
  }

  public enum Phase: Equatable, Sendable {
    case idle
    case sending(ImagePurpose)
    case failed(ImagePurpose, Failure)
  }

  public static let maxBytes = 10_000_000

  public private(set) var phase: Phase = .idle

  private let uploads: any ImageUploads
  private let images: any ProfileImages

  public init(uploads: any ImageUploads, images: any ProfileImages) {
    self.uploads = uploads
    self.images = images
  }

  public func setAvatar(_ jpeg: Data) async -> Account? {
    await send(jpeg, as: .avatar) { try await self.images.setAvatar($0) }
  }

  public func setBanner(_ jpeg: Data) async -> Channel? {
    await send(jpeg, as: .banner) { try await self.images.setBanner($0) }
  }

  public func dismissFailure() {
    if case .failed = phase { phase = .idle }
  }

  private func send<Saved>(_ jpeg: Data, as purpose: ImagePurpose, confirm: (UploadID) async throws -> Saved) async -> Saved? {
    if case .sending = phase { return nil }
    guard jpeg.count < Self.maxBytes else {
      phase = .failed(purpose, .tooLarge)
      return nil
    }
    phase = .sending(purpose)
    do {
      let upload = try await uploads.upload(jpeg, type: .jpeg, purpose: purpose)
      let saved = try await confirm(upload)
      phase = .idle
      return saved
    } catch {
      phase = .failed(purpose, .notSaved)
      return nil
    }
  }
}
