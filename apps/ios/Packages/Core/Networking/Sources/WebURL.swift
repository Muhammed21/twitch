import Foundation

extension URL {
  init?(webAddress value: String) {
    guard let url = URL(string: value), let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme) else { return nil }
    self = url
  }
}
