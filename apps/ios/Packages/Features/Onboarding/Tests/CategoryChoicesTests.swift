import Domain
import Foundation
import Onboarding
import Testing

private struct Failure: Error {}

private actor FakeDirectory: CategoryDirectory {
  private var replies: [Result<CategoryPage, Failure>]
  private(set) var calls = 0

  init(_ replies: [Result<CategoryPage, Failure>]) {
    self.replies = replies
  }

  func categories(after _: CategoryCursor?) async throws -> CategoryPage {
    calls += 1
    return try replies.removeFirst().get()
  }
}

private actor FakeFollowing: CategoryFollowing {
  private let failing: Bool
  private(set) var followed: [String] = []
  private(set) var unfollowed: [String] = []

  init(failing: Bool = false) {
    self.failing = failing
  }

  func follow(_ category: CategorySlug) async throws {
    followed.append(category.rawValue)
    if failing { throw Failure() }
  }

  func unfollow(_ category: CategorySlug) async throws {
    unfollowed.append(category.rawValue)
    if failing { throw Failure() }
  }
}

private actor GatedFollowing: CategoryFollowing {
  private var gate: CheckedContinuation<Void, Never>?
  private(set) var follows = 0
  private(set) var unfollows = 0

  var isWaiting: Bool {
    gate != nil
  }

  func follow(_: CategorySlug) async throws {
    follows += 1
    await withCheckedContinuation { gate = $0 }
  }

  func unfollow(_: CategorySlug) async throws {
    unfollows += 1
  }

  func open() {
    gate?.resume()
    gate = nil
  }
}

private func makeCategory(_ slug: String) throws -> BrowseCategory {
  try BrowseCategory(slug: CategorySlug(slug), name: slug.capitalized, imageURL: nil, liveCount: 1, viewers: nil)
}

private func makePage(_ slugs: String...) throws -> CategoryPage {
  try CategoryPage(categories: slugs.map(makeCategory), nextCursor: nil)
}

@MainActor
@Suite("Page 2 : catégories à suivre (parametres/recommandations-categories--defaut, ADR 0049)")
struct CategoryChoicesTests {
  @Test("charge les catégories de Browse et les montre")
  func loads() async throws {
    let choices = try CategoryChoices(directory: FakeDirectory([.success(makePage("fortnite", "music"))]), following: FakeFollowing())

    await choices.load()

    #expect(try choices.state == .loaded([makeCategory("fortnite"), makeCategory("music")]))
  }

  @Test("une liste vide se dit vide, sans erreur")
  func empty() async throws {
    let choices = try CategoryChoices(directory: FakeDirectory([.success(makePage())]), following: FakeFollowing())

    await choices.load()

    #expect(choices.state == .empty)
  }

  @Test("un échec de chargement se réessaie")
  func retriesLoad() async throws {
    let directory = try FakeDirectory([.failure(Failure()), .success(makePage("music"))])
    let choices = CategoryChoices(directory: directory, following: FakeFollowing())

    await choices.load()
    #expect(choices.state == .failed)
    await choices.load()

    #expect(try choices.state == .loaded([makeCategory("music")]))
    #expect(await directory.calls == 2)
  }

  @Test("choisir une catégorie appelle la route de suivi avec son slug ; la choisir de nouveau la désuit")
  func follows() async throws {
    let following = FakeFollowing()
    let choices = try CategoryChoices(directory: FakeDirectory([.success(makePage("fortnite"))]), following: following)
    await choices.load()
    let fortnite = try CategorySlug("fortnite")

    await choices.toggle(fortnite)
    #expect(choices.isFollowing(fortnite))
    #expect(choices.selectionCount == 1)

    await choices.toggle(fortnite)
    #expect(!choices.isFollowing(fortnite))
    #expect(choices.selectionCount == 0)
    #expect(await following.followed == ["fortnite"])
    #expect(await following.unfollowed == ["fortnite"])
  }

  @Test("un échec garde la page, revient à l'état d'avant et permet de réessayer")
  func followFailure() async throws {
    let choices = try CategoryChoices(directory: FakeDirectory([.success(makePage("fortnite"))]), following: FakeFollowing(failing: true))
    await choices.load()
    let fortnite = try CategorySlug("fortnite")

    await choices.toggle(fortnite)

    #expect(!choices.isFollowing(fortnite))
    #expect(choices.failedSlug == fortnite)
    #expect(choices.selectionCount == 0)
  }

  @Test("selection_count compte les catégories suivies")
  func selectionCount() async throws {
    let choices = try CategoryChoices(directory: FakeDirectory([.success(makePage("fortnite", "music", "art"))]), following: FakeFollowing())
    await choices.load()

    try await choices.toggle(CategorySlug("fortnite"))
    try await choices.toggle(CategorySlug("art"))

    #expect(choices.selectionCount == 2)
  }

  @Test("le récap nomme les catégories suivies, dans l'ordre de la liste")
  func followedNames() async throws {
    let choices = try CategoryChoices(directory: FakeDirectory([.success(makePage("fortnite", "music", "art"))]), following: FakeFollowing())
    await choices.load()

    try await choices.toggle(CategorySlug("art"))
    try await choices.toggle(CategorySlug("fortnite"))

    #expect(choices.followedNames == ["Fortnite", "Art"])
  }

  @Test("un toucher pendant un appel en cours est ignoré")
  func ignoresWhilePending() async throws {
    let following = GatedFollowing()
    let choices = try CategoryChoices(directory: FakeDirectory([.success(makePage("fortnite"))]), following: following)
    await choices.load()
    let fortnite = try CategorySlug("fortnite")

    let first = Task { await choices.toggle(fortnite) }
    while await !following.isWaiting {
      await Task.yield()
    }
    #expect(choices.isPending(fortnite))
    await choices.toggle(fortnite)
    await following.open()
    await first.value

    #expect(choices.isFollowing(fortnite))
    #expect(!choices.isPending(fortnite))
    #expect(await following.follows == 1)
    #expect(await following.unfollows == 0)
  }
}
