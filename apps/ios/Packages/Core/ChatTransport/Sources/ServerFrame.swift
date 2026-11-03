import Foundation

enum ServerFrame: Equatable, Sendable {
  case open(pingInterval: Duration, pingTimeout: Duration)
  case close
  case ping
  case connected
  case connectError(String)
  case disconnected
  case event(name: String, payload: Data?)
  case ack(id: Int, payload: Data?)

  static func parse(_ text: String) -> ServerFrame? {
    guard let type = text.first else {
      return nil
    }
    let rest = text.dropFirst()
    switch type {
    case "0": return open(rest)
    case "1" where rest.isEmpty: return .close
    case "2" where rest.isEmpty: return .ping
    case "4": return message(rest)
    default: return nil
    }
  }

  private struct OpenPacket: Decodable {
    let pingInterval: Int
    let pingTimeout: Int
  }

  private struct ConnectErrorPacket: Decodable {
    let message: String
  }

  private static func open(_ body: Substring) -> ServerFrame? {
    guard let packet = try? JSONDecoder().decode(OpenPacket.self, from: Data(body.utf8)) else {
      return nil
    }
    return .open(pingInterval: .milliseconds(packet.pingInterval), pingTimeout: .milliseconds(packet.pingTimeout))
  }

  private static func message(_ text: Substring) -> ServerFrame? {
    guard let type = text.first else {
      return nil
    }
    let rest = text.dropFirst()
    switch type {
    case "0" where rest.isEmpty || rest.first == "{": return .connected
    case "1" where rest.isEmpty: return .disconnected
    case "2": return event(rest)
    case "3": return ack(rest)
    case "4": return connectError(rest)
    default: return nil
    }
  }

  private static func connectError(_ body: Substring) -> ServerFrame? {
    (try? JSONDecoder().decode(ConnectErrorPacket.self, from: Data(body.utf8))).map { .connectError($0.message) }
  }

  private static func event(_ body: Substring) -> ServerFrame? {
    guard let arguments = arguments(body), let name = arguments.first as? String else {
      return nil
    }
    return .event(name: name, payload: payload(arguments.dropFirst().first))
  }

  private static func ack(_ text: Substring) -> ServerFrame? {
    let digits = text.prefix(while: \.isNumber)
    guard let id = Int(digits), let arguments = arguments(text.dropFirst(digits.count)) else {
      return nil
    }
    return .ack(id: id, payload: payload(arguments.first))
  }

  private static func arguments(_ body: Substring) -> [Any]? {
    (try? JSONSerialization.jsonObject(with: Data(body.utf8))) as? [Any]
  }

  private static func payload(_ argument: Any?) -> Data? {
    argument.flatMap { try? JSONSerialization.data(withJSONObject: $0, options: [.fragmentsAllowed]) }
  }
}
