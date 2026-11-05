import Foundation

public enum ImagePurpose: String, Sendable {
  case avatar
  case banner

  public var minimumSize: PixelSize {
    switch self {
    case .avatar: PixelSize(width: 256, height: 256)
    case .banner: PixelSize(width: 1200, height: 480)
    }
  }

  public var outputSize: PixelSize {
    switch self {
    case .avatar: PixelSize(width: 512, height: 512)
    case .banner: PixelSize(width: 1920, height: 768)
    }
  }
}

public struct PixelSize: Equatable, Sendable {
  public let width: Int
  public let height: Int

  public init(width: Int, height: Int) {
    self.width = width
    self.height = height
  }

  public func covers(_ other: PixelSize) -> Bool {
    width >= other.width && height >= other.height
  }
}

public enum ImageType: String, Sendable {
  case jpeg = "image/jpeg"
  case png = "image/png"
  case webp = "image/webp"
}

public struct UploadID: Hashable, Sendable {
  public let rawValue: UUID

  public init(_ rawValue: UUID) {
    self.rawValue = rawValue
  }
}

public struct ImageUploadRequest: Equatable, Sendable {
  public let purpose: ImagePurpose
  public let type: ImageType
  public let byteSize: Int

  public init(purpose: ImagePurpose, type: ImageType, byteSize: Int) {
    self.purpose = purpose
    self.type = type
    self.byteSize = byteSize
  }
}

public struct UploadTicket: Equatable, Sendable {
  public let id: UploadID
  public let url: URL
  public let headers: [String: String]

  public init(id: UploadID, url: URL, headers: [String: String]) {
    self.id = id
    self.url = url
    self.headers = headers
  }
}

public enum ImageUploadError: Error, Equatable, Sendable {
  case invalidTicket
  case rejected(status: Int)
}

public protocol ImageUploads: Sendable {
  func prepare(_ request: ImageUploadRequest) async throws -> UploadTicket
  func send(_ data: Data, with ticket: UploadTicket) async throws
}

public protocol ProfileImages: Sendable {
  func setAvatar(_ upload: UploadID) async throws -> Account
  func setBanner(_ upload: UploadID) async throws -> Channel
}

public extension ImageUploads {
  func upload(_ data: Data, type: ImageType, purpose: ImagePurpose) async throws -> UploadID {
    let ticket = try await prepare(ImageUploadRequest(purpose: purpose, type: type, byteSize: data.count))
    try await send(data, with: ticket)
    return ticket.id
  }
}
