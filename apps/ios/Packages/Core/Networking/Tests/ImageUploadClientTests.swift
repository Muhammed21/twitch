import Domain
import Foundation
import Networking
import Testing

private let now = Date(timeIntervalSince1970: 1_800_000_000)
private let uploadsURL = URL(string: "http://127.0.0.1:3000/v1/images/uploads")!
private let objectURL = URL(string: "http://127.0.0.1:9000/twitch-images/uploads/7a1b2c3d?X-Amz-Signature=abc")!

private func ticketJSON(uploadURL: String = objectURL.absoluteString) -> String {
  #"{"uploadId":"7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d","uploadUrl":"\#(uploadURL)","headers":{"Content-Type":"image/jpeg","x-amz-meta-purpose":"avatar"},"expiresAt":"2026-11-05T12:15:00Z"}"#
}

private func makeClient(api: FakeTransport, storage: FakeTransport) -> ImageUploadClient {
  ImageUploadClient(apiBaseURL: devConfiguration.apiBaseURL, transport: api, storage: storage, tokens: FakeTokenProvider(), now: { now })
}

private func makeTicket() throws -> UploadTicket {
  try UploadTicket(
    id: UploadID(#require(UUID(uuidString: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"))),
    url: objectURL,
    headers: ["Content-Type": "image/jpeg", "x-amz-meta-purpose": "avatar"]
  )
}

@Suite("Envoi d'une image par POST /v1/images/uploads puis PUT sur uploadUrl")
struct ImageUploadClientTests {
  @Test("prépare l'envoi avec le jeton et lit le ticket : identifiant, adresse et en-têtes")
  func prepares() async throws {
    let api = FakeTransport(status: 201, json: ticketJSON())
    let client = makeClient(api: api, storage: FakeTransport(json: ""))

    let ticket = try await client.prepare(ImageUploadRequest(purpose: .avatar, type: .jpeg, byteSize: 48213))

    #expect(try ticket == makeTicket())
    let request = try #require(await api.requests.first)
    #expect(request.method == "POST")
    #expect(request.url == uploadsURL)
    #expect(request.headers["Authorization"] == "Bearer access-1")
    let body = try #require(JSONSerialization.jsonObject(with: request.body) as? NSDictionary)
    #expect(body == ["purpose": "avatar", "contentType": "image/jpeg", "byteSize": 48213])
  }

  @Test("dépose les octets par PUT à l'adresse rendue, avec ses en-têtes et sans jeton")
  func sends() async throws {
    let storage = FakeTransport(json: "")
    let client = makeClient(api: FakeTransport(json: ""), storage: storage)
    let data = Data([0xFF, 0xD8, 0xFF, 0xE0])

    try await client.send(data, with: makeTicket())

    let request = try #require(await storage.requests.first)
    #expect(request.method == "PUT")
    #expect(request.url == objectURL)
    #expect(request.headers == ["Content-Type": "image/jpeg", "x-amz-meta-purpose": "avatar"])
    #expect(request.body == data)
  }

  @Test("un dépôt refusé par le stockage est une erreur", arguments: [403, 500])
  func rejected(status: Int) async throws {
    let storage = FakeTransport(status: status, json: "<Error/>")
    let client = makeClient(api: FakeTransport(json: ""), storage: storage)

    await #expect(throws: ImageUploadError.rejected(status: status)) {
      try await client.send(Data([0x01]), with: makeTicket())
    }
  }

  @Test("une adresse de dépôt qui n'est pas http(s) est refusée")
  func refusesOtherScheme() async throws {
    let api = FakeTransport(status: 201, json: ticketJSON(uploadURL: "file:///tmp/avatar.jpg"))
    let client = makeClient(api: api, storage: FakeTransport(json: ""))

    await #expect(throws: ImageUploadError.invalidTicket) {
      try await client.prepare(ImageUploadRequest(purpose: .avatar, type: .jpeg, byteSize: 1))
    }
  }

  @Test("traduit un refus RFC 9457 (type refusé) en ServiceProblem")
  func translatesProblem() async throws {
    let api = FakeTransport(status: 422, json: #"{"type":"about:blank","title":"Unprocessable Entity","status":422}"#)
    let client = makeClient(api: api, storage: FakeTransport(json: ""))

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Unprocessable Entity", status: 422, detail: nil)) {
      try await client.prepare(ImageUploadRequest(purpose: .banner, type: .webp, byteSize: 1))
    }
  }
}
