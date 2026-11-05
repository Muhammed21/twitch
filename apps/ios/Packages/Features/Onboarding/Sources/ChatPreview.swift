import DesignSystem
import Foundation

public enum ChatPreview {
  private static let authorIDs = [UUID(), UUID(), UUID()]

  public static func label(locale: Locale = .current) -> String {
    text("journey.chat.preview", locale: locale)
  }

  public static func lines(locale: Locale = .current) -> [ChatLine] {
    [
      ChatLine(
        time: "21:04",
        authorID: authorIDs[0],
        author: "nightowl_tv:",
        body: text("journey.chat.preview.clutch", locale: locale),
        badges: [.turboBattery],
        nameColor: .purple
      ),
      ChatLine(
        time: "21:04",
        authorID: authorIDs[1],
        author: "pixel_pam:",
        body: text("journey.chat.preview.goodGame", locale: locale),
        nameColor: .teal
      ),
      ChatLine(
        time: "21:05",
        authorID: authorIDs[2],
        author: "lunarfox:",
        body: text("journey.chat.preview.readable", locale: locale),
        nameColor: .green
      ),
    ]
  }

  private static func text(_ key: String.LocalizationValue, locale: Locale) -> String {
    var resource = LocalizedStringResource(key, table: "ChatPreview", bundle: .module)
    resource.locale = locale
    return String(localized: resource)
  }
}
