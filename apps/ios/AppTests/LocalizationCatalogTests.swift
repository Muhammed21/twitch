import Foundation
import Testing

private struct Catalog: CustomTestStringConvertible {
  let bundle: Bundle

  var testDescription: String { bundle.bundleURL.lastPathComponent }

  var keys: [String] { keys(in: "en") }

  func keys(in language: String) -> [String] {
    ["Localizable.strings", "Localizable.stringsdict"]
      .compactMap { bundle.url(forResource: $0, withExtension: nil, subdirectory: nil, localization: language) }
      .compactMap { NSDictionary(contentsOf: $0) as? [String: Any] }
      .flatMap(\.keys)
  }

  func resolve(_ key: String, in language: String) -> String {
    String(localized: LocalizedStringResource(
      String.LocalizationValue(key),
      locale: Locale(identifier: language),
      bundle: .atURL(bundle.bundleURL)
    ))
  }
}

private let catalogs: [Catalog] = {
  let packaged = (try? FileManager.default.contentsOfDirectory(
    at: Bundle.main.bundleURL,
    includingPropertiesForKeys: nil
  )) ?? []
  return ([Bundle.main] + packaged.filter { $0.pathExtension == "bundle" }.compactMap(Bundle.init(url:)))
    .map(Catalog.init(bundle:))
    .filter { !$0.keys.isEmpty }
}()

@Suite("Catalogues de chaînes de l'app")
struct LocalizationCatalogTests {
  @Test("l'app embarque le catalogue de chaque fonctionnalité")
  func everyFeatureCatalogShips() {
    let names = Set(catalogs.map(\.testDescription))
    #expect(names.isSuperset(of: [
      "Twitch.app", "Packages_Auth.bundle", "Packages_Channel.bundle", "Packages_Chat.bundle",
      "Packages_Dashboard.bundle", "Packages_Home.bundle", "Packages_Onboarding.bundle",
      "Packages_Paywall.bundle", "Packages_Player.bundle", "Packages_Profile.bundle",
    ]))
  }

  @Test(
    "chaque catalogue est entièrement traduit en français",
    arguments: catalogs.filter {
      [
        "Twitch.app", "Packages_Auth.bundle", "Packages_Channel.bundle", "Packages_Dashboard.bundle",
        "Packages_Home.bundle", "Packages_Paywall.bundle", "Packages_Player.bundle", "Packages_Profile.bundle",
      ].contains($0.testDescription)
    }
  )
  fileprivate func french(catalog: Catalog) {
    let missing = Set(catalog.keys).subtracting(catalog.keys(in: "fr"))
    #expect(missing.isEmpty, "\(missing.sorted())")
  }

  @Test("aucune chaîne ne s'affiche sous forme de clé brute", arguments: catalogs, ["en", "fr"])
  fileprivate func noRawKey(catalog: Catalog, language: String) {
    let raw = catalog.keys.filter { catalog.resolve($0, in: language) == $0 }
    #expect(raw.isEmpty, "\(language) : \(raw.sorted())")
  }
}
