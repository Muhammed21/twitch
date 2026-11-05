import Foundation
import Network

final class NetworkCost: Sendable {
  private let monitor = NWPathMonitor()

  init() {
    monitor.start(queue: DispatchQueue(label: "com.muhammedcavus.twitch.network-cost"))
  }

  var isExpensive: Bool {
    monitor.currentPath.isExpensive
  }

  deinit {
    monitor.cancel()
  }
}
