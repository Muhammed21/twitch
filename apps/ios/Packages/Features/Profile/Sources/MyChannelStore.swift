import Domain
import Foundation
import Observation
import os

@MainActor
@Observable
public final class MyChannelStore {
  public enum Phase: Equatable, Sendable {
    case loading
    case ready(OwnedChannel)
    case noChannel
    case failed
  }

  public enum Notice: Equatable, Sendable {
    case keyCopied
    case keyUnavailable
    case titleSaved
    case titleFailed
    case keyRotated
    case keyRotationFailed
  }

  public static let maxTitleLength = 140

  public private(set) var phase: Phase = .loading
  public private(set) var title = ""
  public private(set) var streamKey: StreamKey?
  public private(set) var notice: Notice?

  @ObservationIgnored private var keyReads = 0
  @ObservationIgnored private var hasStartedLoading = false

  @ObservationIgnored private let repository: any MyChannelRepository
  @ObservationIgnored private let channels: any ChannelRepository
  @ObservationIgnored private let copy: @MainActor (String) -> Void
  @ObservationIgnored private let log: @Sendable (String) -> Void

  public init(
    repository: any MyChannelRepository,
    channels: any ChannelRepository,
    copy: @escaping @MainActor (String) -> Void,
    log: @escaping @Sendable (String) -> Void = { Logger(subsystem: "Profile", category: "MyChannelStore").error("\($0, privacy: .public)") }
  ) {
    self.repository = repository
    self.channels = channels
    self.copy = copy
    self.log = log
  }

  public static func remaining(in draft: String) -> Int {
    maxTitleLength - draft.trimmingCharacters(in: .whitespacesAndNewlines).count
  }

  public func loadIfNeeded() async {
    guard !hasStartedLoading else {
      return
    }
    await load()
  }

  public func reset() {
    hasStartedLoading = false
    phase = .loading
    title = ""
    leave()
  }

  public func load() async {
    hasStartedLoading = true
    phase = .loading
    hideKey()
    notice = nil
    do {
      guard let owned = try await repository.ownedChannel() else {
        phase = .noChannel
        return
      }
      title = try await channels.channel(withSlug: owned.slug).title
      phase = .ready(owned)
    } catch {
      log("my channel: channel not loaded (\(Self.kind(of: error)))")
      phase = .failed
    }
  }

  public func revealKey() async {
    guard case let .ready(owned) = phase else {
      return
    }
    let read = keyReads
    do {
      let key = try await repository.streamKey(of: owned.id)
      guard read == keyReads else {
        return
      }
      streamKey = key
      notice = nil
    } catch {
      log("my channel: stream key not read (\(Self.kind(of: error)))")
      notice = .keyUnavailable
    }
  }

  public func rotateKey() async {
    guard case let .ready(owned) = phase else {
      return
    }
    keyReads += 1
    do {
      streamKey = try await repository.rotateStreamKey(of: owned.id)
      notice = .keyRotated
    } catch {
      log("my channel: stream key not rotated (\(Self.kind(of: error)))")
      notice = .keyRotationFailed
    }
  }

  public func hideKey() {
    keyReads += 1
    streamKey = nil
  }

  public func leave() {
    hideKey()
    notice = nil
  }

  public func copyKey() {
    guard let streamKey else {
      return
    }
    copy(streamKey.revealed)
    notice = .keyCopied
  }

  public func rename(to draft: String) async -> Bool {
    guard case let .ready(owned) = phase, Self.remaining(in: draft) >= 0 else {
      return false
    }
    do {
      title = try await repository.rename(owned.id, to: draft).title
      notice = .titleSaved
      return true
    } catch {
      log("my channel: title not saved (\(Self.kind(of: error)))")
      notice = .titleFailed
      return false
    }
  }

  private static func kind(of error: any Error) -> String {
    guard let problem = error as? ServiceProblem else {
      return String(describing: type(of: error))
    }
    return "status \(problem.status)"
  }
}
