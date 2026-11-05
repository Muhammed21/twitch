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
  #"{"minSupportedVersion":"1.0.0","flags":{"session_replay":false},"entitlements":[],"profile":\#(profile)}"#
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

  @Test("change le titre seul quand la catégorie ne change pas, et rend la chaîne à jour")
  func updatesTitleOnly() async throws {
    let transport = FakeTransport(
      json: #"{"id":"9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69","slug":"viewer_de_test","title":"Speedrun du dimanche","ownerId":"\#(ownerID)","tags":[],"contentLabels":[],"isBrandedContent":false}"#
    )

    let channel = try await makeClient(transport).update(channelID, title: "Speedrun du dimanche", category: .keep)

    #expect(channel.title == "Speedrun du dimanche")
    #expect(channel.category == nil)
    let request = try #require(await transport.requests.first)
    #expect(request.method == "PATCH")
    #expect(request.url == channelURL)
    #expect(request.headers["Authorization"] == "Bearer access-1")
    let body = try #require(JSONSerialization.jsonObject(with: request.body) as? [String: String])
    #expect(body == ["title": "Speedrun du dimanche"])
  }

  @Test("pose la catégorie choisie avec le titre, et lit la catégorie rendue")
  func setsCategory() async throws {
    let categoryID = try CategoryID(#require(UUID(uuidString: "1C9E4A52-7D3B-4F8E-A6B1-2D5C8E9F0A13")))
    let category = #"{"id":"1c9e4a52-7d3b-4f8e-a6b1-2d5c8e9f0a13","slug":"honor-of-kings","name":"Honor of Kings"}"#
    let transport = FakeTransport(
      json: #"{"id":"9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69","slug":"viewer_de_test","title":"Rank","ownerId":"\#(ownerID)","tags":[],"contentLabels":[],"isBrandedContent":false,"category":\#(category)}"#
    )

    let channel = try await makeClient(transport).update(channelID, title: "Rank", category: .set(categoryID))

    #expect(channel.category == ChannelCategory(id: categoryID, name: "Honor of Kings"))
    let request = try #require(await transport.requests.first)
    let body = try #require(JSONSerialization.jsonObject(with: request.body) as? NSDictionary)
    #expect(body == ["title": "Rank", "category": ["id": "1C9E4A52-7D3B-4F8E-A6B1-2D5C8E9F0A13"]])
  }

  @Test("retire la catégorie en envoyant une catégorie sans identifiant")
  func clearsCategory() async throws {
    let transport = FakeTransport(
      json: #"{"id":"9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69","slug":"viewer_de_test","title":"Rank","ownerId":"\#(ownerID)","tags":[],"contentLabels":[],"isBrandedContent":false}"#
    )

    let channel = try await makeClient(transport).update(channelID, title: "Rank", category: .clear)

    #expect(channel.category == nil)
    let request = try #require(await transport.requests.first)
    let body = try #require(JSONSerialization.jsonObject(with: request.body) as? NSDictionary)
    #expect(body == ["title": "Rank", "category": [String: String]()])
  }

  @Test("remplace la clé de stream par une nouvelle, avec le jeton du propriétaire")
  func rotatesStreamKey() async throws {
    let transport = FakeTransport(json: #"{"streamKey":"live_nouvelle","ingestUrl":"rtmp://127.0.0.1:1935/live"}"#)

    let key = try await makeClient(transport).rotateStreamKey(of: channelID)

    #expect(key.revealed == "live_nouvelle")
    #expect(key.ingestURL == URL(string: "rtmp://127.0.0.1:1935/live"))
    let request = try #require(await transport.requests.first)
    #expect(request.method == "POST")
    #expect(try request.url == #require(streamKeyURL).appendingPathComponent("rotate"))
    #expect(request.headers["Authorization"] == "Bearer access-1")
  }

  @Test("remonte le problème du serveur quand la rotation est refusée", arguments: [403, 404])
  func rotationRefused(status: Int) async {
    let transport = FakeTransport(status: status, json: refusal(status))

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Refus", status: status, detail: nil)) {
      try await makeClient(transport).rotateStreamKey(of: channelID)
    }
  }

  @Test("remonte le problème du serveur quand la clé est refusée", arguments: [403, 404])
  func streamKeyRefused(status: Int) async {
    let transport = FakeTransport(status: status, json: refusal(status))

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Refus", status: status, detail: nil)) {
      try await makeClient(transport).streamKey(of: channelID)
    }
  }

  @Test("remonte le problème du serveur quand le titre ou la catégorie sont refusés", arguments: [403, 422])
  func updateRefused(status: Int) async {
    let transport = FakeTransport(status: status, json: refusal(status))

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Refus", status: status, detail: nil)) {
      try await makeClient(transport).update(channelID, title: "Titre", category: .keep)
    }
  }
}
