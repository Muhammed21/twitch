import Foundation

func shown(english: String, french: String) -> String {
  Locale.preferredLanguages.first?.hasPrefix("fr") == true ? french : english
}

func english(_ resource: LocalizedStringResource) -> String {
  var english = resource
  english.locale = Locale(identifier: "en")
  return String(localized: english)
}

func french(_ resource: LocalizedStringResource) -> String {
  var french = resource
  french.locale = Locale(identifier: "fr")
  return String(localized: french)
}
