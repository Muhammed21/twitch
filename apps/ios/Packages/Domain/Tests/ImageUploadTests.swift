import Domain
import Foundation
import Testing

private actor FakeUploads: ImageUploads {
  private(set) var prepared: [ImageUploadRequest] = []
  private(set) var sent: [(Data, UploadTicket)] = []
  private let ticket: UploadTicket
  private let failsSending: Bool

  init(ticket: UploadTicket, failsSending: Bool = false) {
    self.ticket = ticket
    self.failsSending = failsSending
  }

  func prepare(_ request: ImageUploadRequest) async throws -> UploadTicket {
    prepared.append(request)
    return ticket
  }

  func send(_ data: Data, with ticket: UploadTicket) async throws {
    sent.append((data, ticket))
    if failsSending { throw ImageUploadError.rejected(status: 403) }
  }
}

private func makeTicket() throws -> UploadTicket {
  try UploadTicket(
    id: UploadID(#require(UUID(uuidString: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"))),
    url: #require(URL(string: "http://127.0.0.1:9000/twitch-images/uploads/7a1b2c3d?X-Amz-Signature=abc")),
    headers: ["Content-Type": "image/jpeg"]
  )
}

@Suite("Envoi d'une image : préparer, puis déposer à l'adresse rendue")
struct ImageUploadTests {
  @Test("prépare l'envoi avec l'usage, le type et la taille, puis dépose les octets avec le ticket")
  func uploads() async throws {
    let ticket = try makeTicket()
    let uploads = FakeUploads(ticket: ticket)
    let data = Data([0xFF, 0xD8, 0xFF, 0xE0])

    let id = try await uploads.upload(data, type: .jpeg, purpose: .avatar)

    #expect(id == ticket.id)
    #expect(await uploads.prepared == [ImageUploadRequest(purpose: .avatar, type: .jpeg, byteSize: 4)])
    let sent = await uploads.sent
    #expect(sent.map(\.0) == [data])
    #expect(sent.map(\.1) == [ticket])
  }

  @Test("un dépôt refusé fait échouer l'envoi")
  func rejectedUpload() async throws {
    let uploads = try FakeUploads(ticket: makeTicket(), failsSending: true)

    await #expect(throws: ImageUploadError.rejected(status: 403)) {
      try await uploads.upload(Data([0x89, 0x50]), type: .png, purpose: .banner)
    }
  }

  @Test("les types acceptés par l'API", arguments: [(ImageType.jpeg, "image/jpeg"), (.png, "image/png"), (.webp, "image/webp")])
  func contentTypes(type: ImageType, expected: String) {
    #expect(type.rawValue == expected)
  }
}
