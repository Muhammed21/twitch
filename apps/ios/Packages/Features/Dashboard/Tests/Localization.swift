import Foundation

func localized(_ resource: LocalizedStringResource, in language: String) -> String {
  var localized = resource
  localized.locale = Locale(identifier: language)
  return String(localized: localized)
}

func english(_ resource: LocalizedStringResource) -> String {
  localized(resource, in: "en")
}

func french(_ resource: LocalizedStringResource) -> String {
  localized(resource, in: "fr")
}
