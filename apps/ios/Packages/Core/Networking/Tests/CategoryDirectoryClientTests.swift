import Domain
import Foundation
import Networking
import Testing

private let categoriesURL = URL(string: "http://127.0.0.1:3000/v1/categories")!

private func categoryJSON(
  slug: String = "just-chatting",
  imageURL: String? = nil,
  liveCount: Int = 3,
  viewerCount: Int? = nil
) -> String {
  let image = imageURL.map { #","imageUrl":"\#($0)""# } ?? ""
  let viewers = viewerCount.map { #","viewerCount":\#($0)"# } ?? ""
  return #"{"slug":"\#(slug)","name":"Just Chatting","liveCount":\#(liveCount)\#(image)\#(viewers)}"#
}

private func makeClient(_ transport: FakeTransport) -> CategoryDirectoryClient {
  CategoryDirectoryClient(apiBaseURL: devConfiguration.apiBaseURL, transport: transport)
}

@Suite("Catégories en live sur GET /v1/categories")
struct CategoryDirectoryClientTests {
  @Test("demande les catégories sans authentification et les décode dans l'ordre de l'API")
  func browse() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(categoryJSON(viewerCount: 184_000)),\#(categoryJSON(slug: "fortnite", liveCount: 1))]}"#)

    let categories = try await makeClient(transport).categories(after: nil).categories

    #expect(try categories == [
      BrowseCategory(slug: CategorySlug("just-chatting"), name: "Just Chatting", imageURL: nil, liveCount: 3, viewers: ViewerCount(184_000)),
      BrowseCategory(slug: CategorySlug("fortnite"), name: "Just Chatting", imageURL: nil, liveCount: 1, viewers: nil),
    ])
    let request = try #require(await transport.requests.first)
    #expect(request.method == "GET")
    #expect(request.url == categoriesURL)
    #expect(request.headers["Authorization"] == nil)
  }

  @Test("tant que l'API ne pagine pas les catégories, la liste tient en une page sans curseur suivant")
  func singlePage() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(categoryJSON())]}"#)

    let page = try await makeClient(transport).categories(after: nil)

    #expect(page.nextCursor == nil)
  }

  @Test("lit la pochette d'une catégorie quand l'API la donne")
  func readsImage() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(categoryJSON(imageURL: "https://cdn.example/just-chatting.png"))]}"#)

    let categories = try await makeClient(transport).categories(after: nil).categories

    #expect(categories.first?.imageURL == URL(string: "https://cdn.example/just-chatting.png"))
  }

  @Test("garde la catégorie et ignore un nombre de viewers négatif")
  func ignoresNegativeViewerCount() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(categoryJSON(viewerCount: -1))]}"#)

    let categories = try await makeClient(transport).categories(after: nil).categories

    #expect(categories.count == 1)
    #expect(categories.first?.viewers == nil)
  }

  @Test("écarte une catégorie au slug invalide sans perdre les autres")
  func dropsMalformedSlug() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(categoryJSON(slug: "Just Chatting")),\#(categoryJSON())]}"#)

    let categories = try await makeClient(transport).categories(after: nil).categories

    #expect(categories.map(\.slug.rawValue) == ["just-chatting"])
  }

  @Test("tolère un champ ajouté à la catégorie et à la liste (ADR 0024, §8)")
  func toleratesAddedFields() async throws {
    let transport = FakeTransport(json: #"{"items":[\#(categoryJSON().dropLast()),"tags":["IRL"]}],"total":1}"#)

    let categories = try await makeClient(transport).categories(after: nil).categories

    #expect(categories.count == 1)
  }

  @Test("traduit une réponse d'erreur RFC 9457 en ServiceProblem")
  func translatesProblem() async throws {
    let transport = FakeTransport(status: 503, json: #"{"type":"about:blank","title":"Service Unavailable","status":503}"#)

    await #expect(throws: ServiceProblem(type: "about:blank", title: "Service Unavailable", status: 503, detail: nil)) {
      try await makeClient(transport).categories(after: nil)
    }
  }
}
