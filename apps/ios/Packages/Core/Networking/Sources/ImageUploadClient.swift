import Domain
import Foundation
import OpenAPIRuntime

public struct ImageUploadClient: ImageUploads {
  private let client: Client
  private let storage: any HTTPTransport

  public init(
    apiBaseURL: URL,
    transport: any HTTPTransport,
    storage: any HTTPTransport,
    tokens: any AccessTokenProvider,
    now: @escaping @Sendable () -> Date
  ) {
    client = Client(
      apiBaseURL: apiBaseURL,
      transport: transport,
      middlewares: [BearerAuthentication(tokens: tokens, now: now)]
    )
    self.storage = storage
  }

  public func prepare(_ request: ImageUploadRequest) async throws -> UploadTicket {
    let body = Components.Schemas.PrepareImageUploadRequest(
      purpose: .init(request.purpose),
      contentType: request.type.rawValue,
      byteSize: request.byteSize
    )
    let output = try await unwrappingClientError { try await client.imagesControllerPrepareUpload(body: .json(body)) }
    switch output {
    case let .created(response):
      let upload = try response.body.json
      guard let url = URL(webAddress: upload.uploadUrl) else { throw ImageUploadError.invalidTicket }
      return UploadTicket(id: UploadID(upload.uploadId), url: url, headers: upload.headers.additionalProperties)
    case let .default(_, response):
      throw try ServiceProblem(response.body.applicationProblemJson)
    }
  }

  public func send(_ data: Data, with ticket: UploadTicket) async throws {
    let response = try await storage.send(HTTPRequest(method: "PUT", url: ticket.url, headers: ticket.headers, body: data))
    guard (200 ..< 300).contains(response.status) else { throw ImageUploadError.rejected(status: response.status) }
  }
}

private extension Components.Schemas.PrepareImageUploadRequest.PurposePayload {
  init(_ purpose: ImagePurpose) {
    switch purpose {
    case .avatar: self = .avatar
    case .banner: self = .banner
    }
  }
}
