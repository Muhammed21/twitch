import Foundation

public enum StreamManagerWidget: String, CaseIterable, Hashable, Sendable {
  case streamInfo
  case streamKey
  case obs

  public static let initial = StreamManagerWidget.streamInfo

  public var title: LocalizedStringResource {
    switch self {
    case .streamInfo: LocalizedStringResource("streamManager.widget.streamInfo", bundle: .module)
    case .streamKey: LocalizedStringResource("streamManager.widget.streamKey", bundle: .module)
    case .obs: LocalizedStringResource("streamManager.widget.obs", bundle: .module)
    }
  }

  public var accessibilityIdentifier: String { "streamManager.widget.\(rawValue)" }

  var systemImage: String {
    switch self {
    case .streamInfo: "pencil"
    case .streamKey: "key"
    case .obs: "slider.horizontal.3"
    }
  }
}
