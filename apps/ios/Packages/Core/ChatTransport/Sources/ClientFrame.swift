import Domain
import Foundation

enum ClientFrame: Equatable, Sendable {
  case pong
  case connect
  case join(ChannelID)
  case leave(ChannelID)
  case send(ackID: Int, body: String, channel: ChannelID)

  var text: String {
    switch self {
    case .pong: "3"
    case .connect: "40"
    case let .join(channel): "42" + Self.arguments("room:join", RoomPayload(channel))
    case let .leave(channel): "42" + Self.arguments("room:leave", RoomPayload(channel))
    case let .send(ackID, body, channel):
      "42\(ackID)" + Self.arguments("chat:send", SendPayload(body: body, channelId: Self.wireID(channel)))
    }
  }

  private struct RoomPayload: Encodable {
    let channelId: String

    init(_ channel: ChannelID) {
      channelId = ClientFrame.wireID(channel)
    }
  }

  private struct SendPayload: Encodable {
    let body: String
    let channelId: String
  }

  private static func wireID(_ channel: ChannelID) -> String {
    channel.rawValue.uuidString.lowercased()
  }

  private static func arguments(_ name: String, _ payload: some Encodable) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    let encoded = (try? encoder.encode(payload)).flatMap { String(bytes: $0, encoding: .utf8) } ?? "{}"
    return "[\"\(name)\",\(encoded)]"
  }
}
