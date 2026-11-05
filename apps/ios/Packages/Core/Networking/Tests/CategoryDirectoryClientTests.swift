import Domain
import Foundation
import Networking
import Testing

private let categoriesURL = URL(string: "http://127.0.0.1:3000/v1/categories")!

private func categoryJSON(
  slug: String = "just-chatting",
  imageURL: String? = nil,
  liveCount: Int = 3,
  viewerCount: Int = 0,
  tags: [String] = []
) -> String {
  let image = imageURL.map { #","imageUrl":"\#($0)""# } ?? ""
  let tagList = tags.map { #""\#($0)""# }.joined(separator: ",")
  return #"{"slug":"\#(slug)","name":"Just Chatting","liveCount":\#(liveCount),"viewerCount":\#(viewerCount),"tags":[\#(tagList)]\#(image)}"#
}

private func makeClient(_ transport: FakeTransport) -> CategoryDirectoryClient {
  CategoryDirectoryClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport)
}

@Suite("Catégories en live paginées sur GET /v1/categories (ADR 0047)")
struct CategoryDirectoryClientTests {
  @Test("demande la première page sans curseur ni authentification, et décode catégories et curseur suivant")
  func firstPage() async throws {
    let items = "\(categoryJSON(viewerCount: 184_000, tags: ["IRL", "Discussion"])),\(categoryJSON(slug: "fortnite", liveCount: 1, viewerCount: 22000))"
    let transport = FakeTransport(json: #"{"items":[\#(items)],"nextCursor":"c2"}"#)

    let page = try await makeClient(transport).categories(after: nil)

    #expect(try page == CategoryPage(
      categories: [
        BrowseCategory(
          slug: CategorySlug("just-chatting"),
          name: "Just Chatting",
          imageURL: nil,
          liveCount: 3,
          viewers: ViewerCount(184_000),
          tags: ["IRL", "Discussion"]
        ),
        BrowseCategory(slug: CategorySlug("fortnite"), name: "Just Chatting", imageURL: nil, liveCount: 1, viewers: ViewerCount(22000)),
      ],
      nextCursor: CategoryCursor("c2")
    ))
    let request = try #require(await transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url == categoriesURL)
    #expect(request.headers["Authorization"] == nil)
  }

  @Test("renvoie le curseur reçu tel quel pour la page suivante ; sans nextCursor, la liste est finie")
  func nextPage() async throws {
    let transport = FakeTransport(json: #"{"items":[]}"#)

    let page = try await makeClient(transport).categories(after: CategoryCursor("WyIxODQiXQ&x=1 2"))

    #expect(page == CategoryPage(categories: [], nextCursor: nil))
    let url = try #require(await transport.requests.first?.url)
    let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
    #expect(components.path == categoriesURL.path())
    #expect(components.queryItems == [URLQueryItem(name: "cursor", value: "WyIxODQiXQ&x=1 2")])
  }

  @Test("lit la pochette d'une catégorie quand l'API la donne")
  func readsImage() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(categoryJSON(imageURL: "https://cdn.example/just-chatting.png"))]}"#)

    let page = try await makeClient(transport).categories(after: nil)

    #expect(page.categories.first?.imageURL == URL(string: "https://cdn.example/just-chatting.png"))
  }

  @Test("lit les tags d'une catégorie dans l'ordre de l'API")
  func readsTags() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(categoryJSON(tags: ["Jeux de tir", "FPS"]))]}"#)

    let page = try await makeClient(transport).categories(after: nil)

    #expect(page.categories.first?.tags == ["Jeux de tir", "FPS"])
  }

  @Test("lit zéro viewer, et ignore un nombre de viewers négatif sans perdre la catégorie", arguments: [(0, 0), (-1, nil)])
  func viewerCount(count: Int, expected: Int?) async throws {
    let transport = FakeTransport(json: #"{"items":[\#(categoryJSON(viewerCount: count))]}"#)

    let page = try await makeClient(transport).categories(after: nil)

    #expect(page.categories.count == 1)
    #expect(try page.categories.first?.viewers == expected.map { try ViewerCount($0) })
  }

  @Test("écarte une catégorie au slug invalide sans perdre le reste de la page")
  func dropsMalformedSlug() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(categoryJSON(slug: "Just Chatting")),\#(categoryJSON())],"nextCursor":"c2"}"#)

    let page = try await makeClient(transport).categories(after: nil)

    #expect(page.categories.map(\.slug.rawValue) == ["just-chatting"])
    #expect(page.nextCursor == CategoryCursor("c2"))
  }

  @Test("tolère un champ ajouté à la catégorie et à la page (ADR 0024, §8)")
  func toleratesAddedFields() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(categoryJSON().dropLast()),"followerCount":12}],"total":1}"#)

    let page = try await makeClient(transport).categories(after: nil)

    #expect(page.categories.count == 1)
  }

  @Test("traduit une réponse d'erreur RFC 9457 en ServiceProblem")
  func translatesProblem() async throws {
    let transport = FakeTransport(status: 400, json: #"{"type":"about:blank","title":"Bad Request","status":400}"#)

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Bad Request", status: 400, detail: nil)) {
      try await makeClient(transport).categories(after: nil)
    }
  }
}
