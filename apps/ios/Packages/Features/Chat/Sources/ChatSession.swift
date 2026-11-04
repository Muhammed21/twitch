import Domain
import Foundation
import Observation
import os

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
    case channelNotFound
  }

  public enum ModerationNotice: Equatable, Sendable {
    case timedOut(String)
    case forbidden
    case failed(String)
  }

  private enum Ending {
    case cancelled
    case unauthorized(token: String, lived: Bool)
    case failed(lived: Bool)
    case final(Status)
  }

  private static let maxDelaySeconds = 30
  private static let batchInterval = Duration.milliseconds(100)
  private static let livedAfter: TimeInterval = 30
  private static let timeoutDuration = Duration.seconds(600)

  public private(set) var messages: [ChatMessage] = []
  public private(set) var status = Status.connecting
  public private(set) var moderationNotice: ModerationNotice?
  private var owner: UUID?

  @ObservationIgnored private let connector: any ChatConnector
  @ObservationIgnored private let tokens: any AccessTokenProvider
  @ObservationIgnored private let channels: any ChannelRepository
  @ObservationIgnored private let moderation: any ChatModeration
  @ObservationIgnored private let viewer: @MainActor @Sendable () -> UUID?
  @ObservationIgnored private let window: Int
  @ObservationIgnored private let wait: Wait
  @ObservationIgnored private let jitter: Jitter
  @ObservationIgnored private let now: @Sendable () -> Date
  @ObservationIgnored private let log: @Sendable (String) -> Void
  @ObservationIgnored private var connection: (any ChatConnection)?
  @ObservationIgnored private var channel: ChannelID?
  @ObservationIgnored private var batch: [ChatMessage] = []
  @ObservationIgnored private var flush: Task<Void, Never>?

  public init(
    connector: any ChatConnector,
    tokens: any AccessTokenProvider,
    channels: any ChannelRepository,
    moderation: any ChatModeration,
    viewer: @escaping @MainActor @Sendable () -> UUID?,
    window: Int = 300,
    wait: @escaping Wait = { try await Task.sleep(for: $0) },
    jitter: @escaping Jitter = { $0 * Double.random(in: 0.5 ... 1) },
    now: @escaping @Sendable () -> Date = Date.init,
    log: @escaping @Sendable (String) -> Void = { Logger(subsystem: "Chat", category: "ChatSession").error("\($0, privacy: .public)") }
  ) {
    self.connector = connector
    self.tokens = tokens
    self.channels = channels
    self.moderation = moderation
    self.viewer = viewer
    self.window = window
    self.wait = wait
    self.jitter = jitter
    self.now = now
    self.log = log
  }

  public func run(_ slug: ChannelSlug) async {
    messages = []
    batch = []
    owner = nil
    moderationNotice = nil
    status = .connecting
    var failures = 0
    while !Task.isCancelled {
      do {
        let found = try await channels.channel(withSlug: slug)
        owner = found.ownerID
        await run(in: found.id)
        return
      } catch let problem as ServiceProblem where problem.status == 404 {
        status = .channelNotFound
        return
      } catch {}
      guard !Task.isCancelled else {
        return
      }
      status = .reconnecting
      try? await wait(jitter(Self.delay(after: failures)))
      failures += 1
    }
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
      case let .unauthorized(token, lived):
        rejectedToken = token
        unauthorized = lived ? 1 : unauthorized + 1
        failures = lived ? 0 : failures
        if unauthorized == 1 {
          continue
        }
      case let .failed(lived):
        rejectedToken = nil
        unauthorized = 0
        failures = lived ? 0 : failures
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

  public func canTimeOut(_ author: ChatAuthor) -> Bool {
    guard let owner, viewer() == owner else {
      return false
    }
    return author.id != owner
  }

  public func timeOut(_ author: ChatAuthor) async {
    guard canTimeOut(author), let channel else {
      return
    }
    let notice: ModerationNotice
    do {
      try await moderation.timeout(author.id, in: channel, for: Self.timeoutDuration)
      notice = .timedOut(author.displayName)
    } catch let problem as ServiceProblem where problem.status == 403 {
      notice = .forbidden
    } catch {
      notice = .failed(author.displayName)
    }
    guard self.channel == channel else {
      return
    }
    moderationNotice = notice
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
      return .failed(lived: false)
    }
    let opened: any ChatConnection
    do {
      opened = try await connector.connect(accessToken: token)
    } catch ChatConnectionError.unauthorized {
      return .unauthorized(token: token, lived: false)
    } catch ChatConnectionError.forbidden {
      return .final(.denied)
    } catch {
      return .failed(lived: false)
    }
    connection = opened
    let ending = await follow(opened, in: channel, token: token)
    connection = nil
    await opened.close()
    return ending
  }

  private func follow(_ opened: any ChatConnection, in channel: ChannelID, token: String) async -> Ending {
    let joinedAt = now()
    var heard = false
    var lived: Bool {
      heard || now().timeIntervalSince(joinedAt) >= Self.livedAfter
    }
    do {
      try await opened.join(channel)
      status = .live
      for try await event in opened.events {
        switch event {
        case let .message(message):
          heard = true
          receive(message)
        case let .cleared(clearance):
          heard = true
          clear(clearance, in: channel)
        case .revoked(.refreshAndReconnect): return .unauthorized(token: token, lived: lived)
        case .revoked(.stop): return .final(.denied)
        case .revoked(.unknown): continue
        }
      }
      return .cancelled
    } catch ChatConnectionError.messageTooLarge {
      log("chat: frame refused by the server (close 1009), client bug")
      return .final(.halted)
    } catch {
      return .failed(lived: lived)
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

  private func clear(_ clearance: ChatClearance, in channel: ChannelID) {
    guard clearance.channelID == channel else {
      return
    }
    let erase = { (message: ChatMessage) in message.author.id == clearance.authorID ? message.deleted() : message }
    batch = batch.map(erase)
    messages = messages.map(erase)
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
