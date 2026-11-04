import Domain
import Foundation
import Networking
import Testing

private let now = Date(timeIntervalSince1970: 1_800_000_000)
private let channelID = ChannelID(UUID(uuidString: "9B8A7F6E-5D4C-4B3A-8F10-1E2D3C4B5A69") ?? UUID())
private let ownerID = "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b"
private let bootstrapURL = URL(string: "http://127.0.0.1:3000/v1/mobile/bootstrap")
private let streamKeyURL = URL(string: "http://127.0.0.1:3000/v1/channels/9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69/stream-key")
private let channelURL = URL(string: "http://127.0.0.1:3000/v1/channels/9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69")
private let secret = "live_7f3a9c2e4b1d"

private func makeClient(_ transport: FakeTransport) -> MyChannelClient {
  MyChannelClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport, tokens: FakeTokenProvider(), now: { now })
}

private func bootstrapJSON(profile: String) -> String {
  #"{"minSupportedVersion":"1.0.0","flags":{"session_replay":false},"profile":\#(profile)}"#
}

private func profileJSON(channel: String? = nil) -> String {
  let channelField = channel.map { #","channel":\#($0)"# } ?? ""
  return #"{"id":"\#(ownerID)","name":"Viewer","email":"v@twitch.local"\#(channelField)}"#
}

private func refusal(_ status: Int) -> String {
  #"{"type":"about:blank","title":"Refus","status":\#(status)}"#
}

@Suite("Ma chaîne : chaîne du compte, clé de stream et titre, avec le jeton du compte")
struct MyChannelClientTests {
  @Test("lit la chaîne du compte dans le profil du bootstrap, avec le jeton")
  func readsOwnedChannel() async throws {
    let channel = #"{"id":"9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69","slug":"viewer_de_test"}"#
    let transport = FakeTransport(json: bootstrapJSON(profile: profileJSON(channel: channel)))

    let owned = try await makeClient(transport).ownedChannel()

    #expect(try owned == OwnedChannel(id: channelID, slug: ChannelSlug("viewer_de_test")))
    let request = try #require(await transport.requests.first)
    #expect(request.url == bootstrapURL)
    #expect(request.headers["Authorization"] == "Bearer access-1")
  }

  @Test("ne rend aucune chaîne tant que celle du compte n'est pas créée")
  func noOwnedChannelYet() async throws {
    let transport = FakeTransport(json: bootstrapJSON(profile: profileJSON()))

    #expect(try await makeClient(transport).ownedChannel() == nil)
  }

  @Test("lit la clé de stream et l'URL d'ingest de la chaîne, avec le jeton du propriétaire")
  func readsStreamKey() async throws {
    let transport = FakeTransport(json: #"{"streamKey":"\#(secret)","ingestUrl":"rtmp://127.0.0.1:1935/live"}"#)

    let key = try await makeClient(transport).streamKey(of: channelID)

    #expect(key.revealed == secret)
    #expect(key.ingestURL == URL(string: "rtmp://127.0.0.1:1935/live"))
    let request = try #require(await transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url == streamKeyURL)
    #expect(request.headers["Authorization"] == "Bearer access-1")
  }

  @Test("refuse une URL d'ingest invalide, sans montrer la clé dans l'erreur")
  func rejectsMalformedIngestURL() async throws {
    let transport = FakeTransport(json: #"{"streamKey":"\#(secret)","ingestUrl":""}"#)

    let error = await #expect(throws: (any Error).self) {
      try await makeClient(transport).streamKey(of: channelID)
    }

    let rendered = try String(describing: #require(error))
    #expect(!rendered.contains(secret))
    #expect(!String(reflecting: error).contains(secret))
  }

  @Test("change le titre de la chaîne et rend la chaîne à jour")
  func renames() async throws {
    let transport = FakeTransport(
      json: #"{"id":"9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69","slug":"viewer_de_test","title":"Speedrun du dimanche","ownerId":"\#(ownerID)"}"#
    )

    let channel = try await makeClient(transport).rename(channelID, to: "Speedrun du dimanche")

    #expect(channel.title == "Speedrun du dimanche")
    let request = try #require(await transport.requests.first)
    #expect(request.method == "PATCH")
    #expect(request.url == channelURL)
    #expect(request.headers["Authorization"] == "Bearer access-1")
    let body = try #require(JSONSerialization.jsonObject(with: request.body) as? [String: String])
    #expect(body == ["title": "Speedrun du dimanche"])
  }

  @Test("remonte le problème du serveur quand la clé est refusée", arguments: [403, 404])
  func streamKeyRefused(status: Int) async {
    let transport = FakeTransport(status: status, json: refusal(status))

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Refus", status: status, detail: nil)) {
      try await makeClient(transport).streamKey(of: channelID)
    }
  }

  @Test("remonte le problème du serveur quand le titre est refusé", arguments: [403, 422])
  func renameRefused(status: Int) async {
    let transport = FakeTransport(status: status, json: refusal(status))

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Refus", status: status, detail: nil)) {
      try await makeClient(transport).rename(channelID, to: "Titre")
    }
  }
}
