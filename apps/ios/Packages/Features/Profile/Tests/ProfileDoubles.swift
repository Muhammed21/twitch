import Domain
import Foundation
import os

let ownerID = UUID(uuidString: "4f2a9c1e-7b3d-4e8a-9f10-2c5d6e7f8a9b") ?? UUID()
let channelID = ChannelID(UUID(uuidString: "9b8a7f6e-5d4c-4b3a-8f10-1e2d3c4b5a69") ?? UUID())
let secret = "live_7f3a9c2e4b1d"
let rotatedSecret = "live_2b8e5d1f9a6c"
let ingestURL = URL(string: "rtmp://127.0.0.1:1935/live") ?? URL(fileURLWithPath: "/")

func makeOwnedChannel() throws -> OwnedChannel {
  try OwnedChannel(id: channelID, slug: ChannelSlug("viewer_de_test"))
}

struct Refused: Error, CustomStringConvertible {
  var description: String { "refusé pour la clé \(secret)" }
}

struct RenameCall: Equatable {
  let channel: ChannelID
  let title: String
}

actor FakeMyChannel: MyChannelRepository {
  private let owned: Result<OwnedChannel?, any Error>
  private let key: Result<StreamKey, any Error>
  private let renamed: Result<Channel, any Error>?
  private let rotated: Result<StreamKey, any Error>
  private(set) var renames: [RenameCall] = []

  init(
    owned: Result<OwnedChannel?, any Error>,
    key: Result<StreamKey, any Error> = .success(StreamKey(secret, ingestURL: ingestURL)),
    renamed: Result<Channel, any Error>? = nil,
    rotated: Result<StreamKey, any Error> = .success(StreamKey(rotatedSecret, ingestURL: ingestURL))
  ) {
    self.owned = owned
    self.key = key
    self.renamed = renamed
    self.rotated = rotated
  }

  func ownedChannel() throws -> OwnedChannel? {
    try owned.get()
  }

  func streamKey(of _: ChannelID) throws -> StreamKey {
    try key.get()
  }

  func rotateStreamKey(of _: ChannelID) throws -> StreamKey {
    try rotated.get()
  }

  func rename(_ channel: ChannelID, to title: String) throws -> Channel {
    renames.append(RenameCall(channel: channel, title: title))
    guard let renamed else {
      return try Channel(id: channel, slug: ChannelSlug("viewer_de_test"), title: title, ownerID: ownerID)
    }
    return try renamed.get()
  }
}

actor HeldKey: MyChannelRepository {
  private var asked = false
  private var onAsked: CheckedContinuation<Void, Never>?
  private var release: CheckedContinuation<Void, Never>?

  func ownedChannel() throws -> OwnedChannel? {
    try makeOwnedChannel()
  }

  func streamKey(of _: ChannelID) async -> StreamKey {
    asked = true
    onAsked?.resume()
    onAsked = nil
    await withCheckedContinuation { release = $0 }
    return StreamKey(secret, ingestURL: ingestURL)
  }

  func rename(_ channel: ChannelID, to title: String) throws -> Channel {
    try Channel(id: channel, slug: ChannelSlug("viewer_de_test"), title: title, ownerID: ownerID)
  }

  func rotateStreamKey(of _: ChannelID) -> StreamKey {
    StreamKey(rotatedSecret, ingestURL: ingestURL)
  }

  func untilAsked() async {
    guard !asked else {
      return
    }
    await withCheckedContinuation { onAsked = $0 }
  }

  func answer() {
    release?.resume()
    release = nil
  }
}

struct FakeChannels: ChannelRepository {
  let title: String

  func channel(withSlug slug: ChannelSlug) throws -> Channel {
    Channel(id: channelID, slug: slug, title: title, ownerID: ownerID)
  }
}

final class LogBook: Sendable {
  private let lines = OSAllocatedUnfairLock(initialState: [String]())

  var entries: [String] {
    lines.withLock { $0 }
  }

  func write(_ line: String) {
    lines.withLock { $0.append(line) }
  }
}

@MainActor
final class Pasteboard {
  private(set) var copied: [String] = []

  func copy(_ value: String) {
    copied.append(value)
  }
}
