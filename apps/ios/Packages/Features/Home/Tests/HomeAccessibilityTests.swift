import Domain
import Foundation
@testable import Home
import SwiftUI
import Testing

private let english = Locale(identifier: "en_US")

private func live(viewers: Int?) throws -> LiveChannel {
  let channelID = try ChannelID(#require(UUID(uuidString: "00000000-0000-0000-0000-000000000001")))
  return try LiveChannel(
    session: StreamSession(channelID: channelID, startedAt: Date(timeIntervalSince1970: 0)),
    slug: ChannelSlug("viewer_dev"),
    title: "Soirée chill",
    viewers: viewers.map { try ViewerCount($0) }
  )
}

private func category(viewers: Int?, tags: [String]) throws -> BrowseCategory {
  try BrowseCategory(
    slug: CategorySlug("fortnite"),
    name: "Fortnite",
    imageURL: nil,
    liveCount: 3,
    viewers: viewers.map { try ViewerCount($0) },
    tags: tags
  )
}

@Suite("Accueil et Parcourir lus par VoiceOver")
struct HomeAccessibilityTests {
  @Test("une carte de live se lit en une phrase : chaîne, en direct, titre, spectateurs")
  func liveCardSentence() throws {
    let card = try HomeCardText.card(for: live(viewers: 1250), locale: english)

    #expect(card.label == shown(
      english: "viewer_dev, Live, Soirée chill, 1.2K viewers",
      french: "viewer_dev, En direct, Soirée chill, 1.2K spectateurs"
    ))
  }

  @Test("sans compteur, la phrase s'arrête au titre")
  func liveCardWithoutViewers() throws {
    let card = try HomeCardText.card(for: live(viewers: nil), locale: english)

    #expect(card.label == shown(english: "viewer_dev, Live, Soirée chill", french: "viewer_dev, En direct, Soirée chill"))
  }

  @Test("une carte de live indique qu'un double tap ouvre la chaîne")
  func liveCardHint() throws {
    let card = try HomeCardText.card(for: live(viewers: nil), locale: english)

    #expect(card.hint == shown(english: "Opens the channel.", french: "Ouvre la chaîne."))
    #expect(card.traits == .isButton)
  }

  @Test("une pochette de catégorie se lit : nom, spectateurs avec leur unité, tag")
  func categorySentence() throws {
    let card = try BrowseText.card(for: category(viewers: 181_100, tags: ["Shooter", "Action"]), locale: english)

    #expect(card.label == shown(english: "Fortnite, 181K viewers, Shooter", french: "Fortnite, 181K spectateurs, Shooter"))
    #expect(card.hint == shown(english: "Opens the category.", french: "Ouvre la catégorie."))
  }

  @Test("une catégorie sans compteur ni tag se lit par son nom seul")
  func categoryNameOnly() throws {
    #expect(try BrowseText.card(for: category(viewers: nil, tags: []), locale: english).label == "Fortnite")
  }

  @Test("l'échec du chargement des lives est annoncé, les autres états non")
  func homeFailureAnnounced() {
    #expect(HomeText.announcement(for: .failed) == HomeText.failed)
    #expect(HomeText.announcement(for: .loading) == nil)
    #expect(HomeText.announcement(for: .loaded(hasMore: false)) == nil)
  }

  @Test("l'échec du chargement des catégories est annoncé, les autres états non")
  func browseFailureAnnounced() {
    #expect(BrowseText.announcement(for: .failed) == BrowseText.failed)
    #expect(BrowseText.announcement(for: .idle) == nil)
    #expect(BrowseText.announcement(for: .loaded(hasMore: true)) == nil)
  }
}
