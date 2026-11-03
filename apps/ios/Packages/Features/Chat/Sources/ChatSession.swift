import Domain
import Foundation
import Observation

@MainActor
@Observable
public final class ChatSession {
  public typealias Wait = @Sendable (Duration) async throws -> Void
  public typealias Jitter = @Sendable (Duration) -> Duration

  public enum Status: Equatable, Sendable {
    case connecting
    case live
    case reconnecting
    case denied
    case halted
    case signedOut
  }

  private enum Ending {
    case cancelled
    case unauthorized(token: String, afterConnecting: Bool)
    case failed(afterConnecting: Bool)
    case final(Status)
  }

  private static let maxDelaySeconds = 30
  private static let batchInterval = Duration.milliseconds(100)

  public private(set) var messages: [ChatMessage] = []
  public private(set) var status = Status.connecting

  @ObservationIgnored private let connector: any ChatConnector
  @ObservationIgnored private let tokens: any AccessTokenProvider
  @ObservationIgnored private let window: Int
  @ObservationIgnored private let wait: Wait
  @ObservationIgnored private let jitter: Jitter
  @ObservationIgnored private let now: @Sendable () -> Date
  @ObservationIgnored private var connection: (any ChatConnection)?
  @ObservationIgnored private var channel: ChannelID?
  @ObservationIgnored private var batch: [ChatMessage] = []
  @ObservationIgnored private var flush: Task<Void, Never>?

  public init(
    connector: any ChatConnector,
    tokens: any AccessTokenProvider,
    window: Int = 300,
    wait: @escaping Wait = { try await Task.sleep(for: $0) },
    jitter: @escaping Jitter = { $0 * Double.random(in: 0.5 ... 1) },
    now: @escaping @Sendable () -> Date = Date.init
  ) {
    self.connector = connector
    self.tokens = tokens
    self.window = window
    self.wait = wait
    self.jitter = jitter
    self.now = now
  }

  public func run(in channel: ChannelID) async {
    self.channel = channel
    status = .connecting
    var failures = 0
    var unauthorized = 0
    var rejectedToken: String?
    while !Task.isCancelled {
      switch await attempt(in: channel, rejectedToken: rejectedToken) {
      case .cancelled:
        return
      case let .final(final):
        status = final
        return
      case let .unauthorized(token, afterConnecting):
        rejectedToken = token
        unauthorized = afterConnecting ? 1 : unauthorized + 1
        failures = afterConnecting ? 0 : failures
        if unauthorized == 1 {
          continue
        }
      case let .failed(afterConnecting):
        rejectedToken = nil
        unauthorized = 0
        failures = afterConnecting ? 0 : failures
      }
      guard !Task.isCancelled else {
        return
      }
      status = .reconnecting
      try? await wait(jitter(Self.delay(after: failures)))
      failures += 1
    }
  }

  public func send(_ body: String) async -> ChatSendOutcome? {
    guard let connection, let channel else {
      return nil
    }
    return try? await connection.send(body, in: channel)
  }

  private func attempt(in channel: ChannelID, rejectedToken: String?) async -> Ending {
    let token: String
    do {
      token = if let rejectedToken {
        try await tokens.accessTokenRejected(rejectedToken, at: now())
      } else {
        try await tokens.accessToken(at: now())
      }
    } catch SessionError.signedOut {
      return .final(.signedOut)
    } catch {
      return .failed(afterConnecting: false)
    }
    let opened: any ChatConnection
    do {
      opened = try await connector.connect(accessToken: token)
    } catch ChatConnectionError.unauthorized {
      return .unauthorized(token: token, afterConnecting: false)
    } catch ChatConnectionError.forbidden {
      return .final(.denied)
    } catch {
      return .failed(afterConnecting: false)
    }
    connection = opened
    let ending = await follow(opened, in: channel, token: token)
    connection = nil
    await opened.close()
    return ending
  }

  private func follow(_ opened: any ChatConnection, in channel: ChannelID, token: String) async -> Ending {
    do {
      try await opened.join(channel)
      status = .live
      for try await event in opened.events {
        switch event {
        case let .message(message): receive(message)
        case .revoked(.refreshAndReconnect): return .unauthorized(token: token, afterConnecting: true)
        case .revoked(.stop): return .final(.denied)
        case .revoked(.unknown): continue
        }
      }
      return .cancelled
    } catch ChatConnectionError.messageTooLarge {
      return .final(.halted)
    } catch {
      return .failed(afterConnecting: true)
    }
  }

  private func receive(_ message: ChatMessage) {
    batch.append(message)
    guard flush == nil else {
      return
    }
    flush = Task { [weak self, wait] in
      try? await wait(Self.batchInterval)
      self?.publish()
    }
  }

  private func publish() {
    flush = nil
    let fresh = batch.reduce(into: [ChatMessage]()) { kept, message in
      if !kept.contains(where: { $0.id == message.id }), !messages.contains(where: { $0.id == message.id }) {
        kept.append(message)
      }
    }
    batch = []
    messages = Array((messages + fresh).suffix(window))
  }

  private static func delay(after failures: Int) -> Duration {
    .seconds(min(maxDelaySeconds, 1 << min(failures, 5)))
  }
}
