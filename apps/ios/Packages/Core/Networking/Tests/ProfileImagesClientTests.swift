import Domain
import Foundation
import Networking
import Testing

private let now = Date(timeIntervalSince1970: 1_800_000_000)
private let uploadID = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
private let unauthorizedJSON = #"{"type":"about:blank","title":"Unauthorized","status":401}"#
private let problemJSON = #"{"type":"about:blank","title":"Unprocessable","status":422,"detail":"upload not finalized"}"#

private let meJSON =
  #"{"id":"4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b","name":"Viewer de test","email":"viewer@twitch.local","avatarUrl":"https://cdn.twitch.local/avatars/viewer.jpg"}"#
private let channelJSON =
  #"{"id":"0f5e2d7a-3c41-4b8e-9a6d-1e2f3a4b5c6d","slug":"jean_dupont","title":"Speedrun","ownerId":"4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b","tags":[],"contentLabels":[],"isBrandedContent":false,"bannerUrl":"https://cdn.twitch.local/banners/jean.jpg"}"#

private func makeClient(_ transport: FakeTransport) -> ProfileImagesClient {
  ProfileImagesClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport, tokens: FakeTokenProvider(), now: { now })
}

private func makeUpload() throws -> UploadID {
  try UploadID(#require(UUID(uuidString: uploadID)))
}

private func sentUpload(_ request: HTTPRequest) throws -> UploadID? {
  let body = try #require(JSONSerialization.jsonObject(with: request.body) as? [String: String])
  #expect(Array(body.keys) == ["uploadId"])
  return body["uploadId"].flatMap(UUID.init(uuidString:)).map(UploadID.init)
}

@Suite("Confirmation de l'avatar et de la bannière par PUT /v1/me/avatar et PUT /v1/me/banner")
struct ProfileImagesClientTests {
  @Test("confirme l'avatar avec le jeton et rend le compte et son nouvel avatar")
  func avatar() async throws {
    let transport = FakeTransport(json: meJSON)

    let account = try await makeClient(transport).setAvatar(makeUpload())

    #expect(account.avatarURL == URL(string: "https://cdn.twitch.local/avatars/viewer.jpg"))
    let request = try #require(await transport.requests.first)
    #expect(request.method == "PUT")
    #expect(request.url == URL(string: "http://127.0.0.1:3000/v1/me/avatar"))
    #expect(request.headers["Authorization"] == "Bearer access-1")
    #expect(try sentUpload(request) == makeUpload())
  }

  @Test("confirme la bannière avec le jeton et rend la chaîne et sa nouvelle bannière")
  func banner() async throws {
    let transport = FakeTransport(json: channelJSON)

    let channel = try await makeClient(transport).setBanner(makeUpload())

    #expect(channel.bannerURL == URL(string: "https://cdn.twitch.local/banners/jean.jpg"))
    let request = try #require(await transport.requests.first)
    #expect(request.method == "PUT")
    #expect(request.url == URL(string: "http://127.0.0.1:3000/v1/me/banner"))
    #expect(request.headers["Authorization"] == "Bearer access-1")
    #expect(try sentUpload(request) == makeUpload())
  }

  @Test("un envoi refusé par l'API remonte son problème")
  func refused() async throws {
    let client = makeClient(FakeTransport(status: 422, json: problemJSON))

    await #expect(throws: ServiceProblem.self) { try await client.setAvatar(makeUpload()) }
    await #expect(throws: ServiceProblem.self) { try await client.setBanner(makeUpload()) }
  }

  @Test("un jeton refusé deux fois termine la session")
  func signedOut() async throws {
    let client = makeClient(FakeTransport(status: 401, json: unauthorizedJSON))

    await #expect(throws: SessionError.signedOut) { try await client.setBanner(makeUpload()) }
  }
}
