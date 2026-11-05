import Foundation

func shown(english: String, french: String) -> String {
  Locale.preferredLanguages.first?.hasPrefix("fr") == true ? french : english
}
