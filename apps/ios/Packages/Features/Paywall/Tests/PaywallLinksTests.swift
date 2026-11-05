import Foundation
import Paywall
import Testing

@Suite("Adresses des conditions et de la confidentialité lues dans Info.plist")
struct PaywallLinksTests {
  @Test("les deux adresses sont lues sous TERMS_URL et PRIVACY_URL")
  func both() {
    let links = PaywallLinks(info: ["TERMS_URL": "https://example.org/terms", "PRIVACY_URL": "https://example.org/privacy"])

    #expect(links.terms == URL(string: "https://example.org/terms"))
    #expect(links.privacy == URL(string: "https://example.org/privacy"))
  }

  @Test("une adresse vide, absente, sans schéma web ou qui n'est pas du texte ne donne pas de lien")
  func missing() {
    #expect(PaywallLinks(info: [:]) == PaywallLinks(terms: nil, privacy: nil))
    #expect(PaywallLinks(info: ["TERMS_URL": "", "PRIVACY_URL": "  "]) == PaywallLinks(terms: nil, privacy: nil))
    #expect(PaywallLinks(info: ["TERMS_URL": "ftp://example.org", "PRIVACY_URL": 3]) == PaywallLinks(terms: nil, privacy: nil))
  }
}
