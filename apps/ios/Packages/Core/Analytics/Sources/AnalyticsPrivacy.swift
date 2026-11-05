import Domain

public enum AnalyticsPrivacy {
  public static func redacted(_ properties: [String: Any]) -> [String: Any] {
    properties.reduce(into: [:]) { kept, property in
      guard !isPersonal(property.key) else { return }
      kept[property.key] = (property.value as? [String: Any]).map(redacted) ?? property.value
    }
  }

  private static func isPersonal(_ key: String) -> Bool {
    guard !key.hasPrefix("$") else {
      return AnalyticsEvent.forbiddenPropertyKeys.contains(String(key.dropFirst()))
    }
    return key.split(separator: "_").contains { AnalyticsEvent.forbiddenPropertyKeys.contains(String($0)) }
  }
}
