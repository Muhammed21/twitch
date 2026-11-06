import Domain
import Foundation
import Observation
import os

@MainActor
@Observable
public final class MyChannelStore {
  public typealias Wait = @Sendable (Duration) async throws -> Void

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
  private static let maxRetryDelaySeconds = 30

  public private(set) var phase: Phase = .loading
  public private(set) var info: StreamInfo
  public private(set) var bannerURL: URL?
  public private(set) var streamKey: StreamKey?
  public private(set) var notice: Notice?
  public private(set) var noticeCount = 0

  @ObservationIgnored private var keyReads = 0
  @ObservationIgnored private var hasStartedLoading = false

  @ObservationIgnored private let repository: any MyChannelRepository
  @ObservationIgnored private let channels: any ChannelRepository
  @ObservationIgnored private let copy: @MainActor (String) -> Void
  @ObservationIgnored private let log: @Sendable (String) -> Void
  @ObservationIgnored private let deviceLanguage: LiveLanguage
  @ObservationIgnored private let wait: Wait

  public init(
    repository: any MyChannelRepository,
    channels: any ChannelRepository,
    copy: @escaping @MainActor (String) -> Void,
    log: @escaping @Sendable (String) -> Void = { Logger(subsystem: "Profile", category: "MyChannelStore").error("\($0, privacy: .public)") },
    deviceLanguage: LiveLanguage = LiveLanguage(localeIdentifier: Locale.current.identifier),
    wait: @escaping Wait = { try await Task.sleep(for: $0) }
  ) {
    self.repository = repository
    self.channels = channels
    self.copy = copy
    self.log = log
    self.deviceLanguage = deviceLanguage
    self.wait = wait
    info = Self.emptyInfo
  }

  public var title: String { info.title }

  public var category: ChannelCategory? { info.category }

  public var proposedInfo: StreamInfo {
    var draft = info
    draft.language = info.language ?? deviceLanguage
    return draft
  }

  public var shareURL: URL? {
    guard case let .ready(owned) = phase else { return nil }
    return owned.slug.appLink
  }

  private static let emptyInfo = StreamInfo(
    title: "",
    category: nil,
    tags: [],
    language: nil,
    contentLabels: [],
    isBrandedContent: false
  )

  private static func streamInfo(of channel: Channel) -> StreamInfo {
    StreamInfo(
      title: channel.title,
      category: channel.category,
      tags: channel.tags,
      language: channel.language,
      contentLabels: channel.contentLabels,
      isBrandedContent: channel.isBrandedContent
    )
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

  public func keepLoaded() async {
    await loadIfNeeded()
    var failures = 0
    while phase == .failed {
      do {
        try await wait(Self.retryDelay(after: failures))
      } catch {
        return
      }
      failures += 1
      await load()
    }
  }

  private static func retryDelay(after failures: Int) -> Duration {
    .seconds(min(maxRetryDelaySeconds, 1 << min(failures, 5)))
  }

  public func loadForEditing() async -> Bool {
    if phase == .failed {
      await load()
    } else {
      await loadIfNeeded()
    }
    guard case .ready = phase else { return false }
    return true
  }

  public func reset() {
    hasStartedLoading = false
    phase = .loading
    info = Self.emptyInfo
    bannerURL = nil
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
      let channel = try await channels.channel(withSlug: owned.slug)
      info = Self.streamInfo(of: channel)
      bannerURL = channel.bannerURL
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
      guard read == keyReads else {
        return
      }
      emit(.keyUnavailable)
    }
  }

  public func rotateKey() async {
    guard case let .ready(owned) = phase else {
      return
    }
    keyReads += 1
    let read = keyReads
    do {
      let key = try await repository.rotateStreamKey(of: owned.id)
      guard read == keyReads else {
        return
      }
      streamKey = key
      emit(.keyRotated)
    } catch {
      log("my channel: stream key not rotated (\(Self.kind(of: error)))")
      guard read == keyReads else {
        return
      }
      emit(.keyRotationFailed)
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

  private func emit(_ emitted: Notice) {
    notice = emitted
    noticeCount += 1
  }

  public func copyKey() {
    guard let streamKey else {
      return
    }
    copy(streamKey.revealed)
    emit(.keyCopied)
  }

  public func bannerSaved(_ channel: Channel) {
    bannerURL = channel.bannerURL
  }

  @discardableResult
  public func save(_ draft: StreamInfo) async -> Bool {
    guard case let .ready(owned) = phase, Self.remaining(in: draft.title) >= 0 else {
      return false
    }
    do {
      let channel = try await repository.update(owned.id, change: StreamInfoChange.from(info, to: draft))
      info = Self.streamInfo(of: channel)
      emit(.titleSaved)
      return true
    } catch {
      log("my channel: title not saved (\(Self.kind(of: error)))")
      emit(.titleFailed)
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
