import Domain
import Foundation
import Observation

@MainActor
@Observable
public final class ProfileImageStore {
  public enum Failure: Equatable, Sendable {
    case tooLarge
    case tooSmall
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
  private let prepare: @Sendable (Data, ImagePurpose) -> PreparedImage

  public init(
    uploads: any ImageUploads,
    images: any ProfileImages,
    prepare: @escaping @Sendable (Data, ImagePurpose) -> PreparedImage = ProfileImageEncoding.prepare
  ) {
    self.uploads = uploads
    self.images = images
    self.prepare = prepare
  }

  public func setAvatar(_ picked: Data) async -> Account? {
    await send(picked, as: .avatar) { try await self.images.setAvatar($0) }
  }

  public func setBanner(_ picked: Data) async -> Channel? {
    await send(picked, as: .banner) { try await self.images.setBanner($0) }
  }

  public func dismissFailure() {
    if case .failed = phase { phase = .idle }
  }

  private func send<Saved>(_ picked: Data, as purpose: ImagePurpose, confirm: (UploadID) async throws -> Saved) async -> Saved? {
    if case .sending = phase { return nil }
    let jpeg: Data
    switch prepare(picked, purpose) {
    case let .jpeg(prepared):
      jpeg = prepared
    case .tooSmall:
      phase = .failed(purpose, .tooSmall)
      return nil
    case .unreadable:
      phase = .failed(purpose, .notSaved)
      return nil
    }
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
