import Foundation

public struct ServerSentEvent: Equatable, Sendable {
  public let name: String
  public let data: String

  public init(name: String, data: String) {
    self.name = name
    self.data = data
  }
}

public struct ServerSentEventParser: Sendable {
  private static let defaultName = "message"

  private var name: String?
  private var data: [String] = []

  public init() {}

  public mutating func feed(_ line: String) -> ServerSentEvent? {
    guard !line.isEmpty else { return dispatch() }
    let (field, value) = Self.split(line)
    switch field {
    case "event": name = value
    case "data": data.append(value)
    default: break
    }
    return nil
  }

  private mutating func dispatch() -> ServerSentEvent? {
    defer {
      name = nil
      data = []
    }
    guard !data.isEmpty else { return nil }
    return ServerSentEvent(name: name ?? Self.defaultName, data: data.joined(separator: "\n"))
  }

  private static func split(_ line: String) -> (field: String, value: String) {
    guard let colon = line.firstIndex(of: ":") else { return (line, "") }
    let value = line[line.index(after: colon)...]
    return (String(line[..<colon]), String(value.hasPrefix(" ") ? value.dropFirst() : value))
  }
}
