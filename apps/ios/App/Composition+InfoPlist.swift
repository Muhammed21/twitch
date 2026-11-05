import Domain
import Foundation

extension Composition {
  nonisolated static func clientVersion(info: [String: Any]) -> String? {
    info["CFBundleShortVersionString"] as? String
  }

  nonisolated static func chatBaseURL(info: [String: Any]) -> URL? {
    guard let value = info["CHAT_BASE_URL"] as? String, let url = URL(string: value), url.host() != nil else {
      return nil
    }
    return url
  }

  static func requiredVersion(info: [String: Any]) -> (String, AppVersion) {
    guard let version = clientVersion(info: info), let currentVersion = try? AppVersion(version) else {
      fatalError("Info.plist : CFBundleShortVersionString manquant ou mal formé.")
    }
    return (version, currentVersion)
  }

  static func requiredChatBaseURL(info: [String: Any]) -> URL {
    guard let chatBaseURL = chatBaseURL(info: info) else {
      fatalError("Info.plist : CHAT_BASE_URL manquant ou mal formé.")
    }
    return chatBaseURL
  }
}
