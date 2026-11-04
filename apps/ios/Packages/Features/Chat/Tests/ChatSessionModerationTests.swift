import Chat
import Domain
import Foundation
import Testing

private let owner = UUID(uuidString: "0d6b8e2a-3c4f-4a5b-9c7d-8e9f0a1b2c3d") ?? UUID()
private let chatter = ChatAuthor(id: UUID(uuidString: "6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d") ?? UUID(), displayName: "yahway_810")

private func slug() throws -> ChannelSlug {
  try ChannelSlug("jean_dupont")
}

@MainActor
private func opened(
  viewer: TestViewer,
  moderation: FakeModeration = FakeModeration()
) async throws -> (ChatSession, Task<Void, Never>) {
  let session = makeSession(
    FakeConnector([.open(FakeConnection())]),
    channels: FakeChannels(owners: ["jean_dupont": owner]),
    moderation: moderation,
    viewer: viewer
  )
  let slug = try slug()
  let run = Task { await session.run(slug) }
  try await waitUntil { session.status == .live }
  return (session, run)
}

@MainActor
@Suite("ChatSession : timeout d'un viewer par le propriétaire de la chaîne", .timeLimit(.minutes(1)))
struct ChatSessionModerationTests {
  @Test("le propriétaire peut mettre en timeout l'auteur d'un message, mais pas lui-même")
  func ownerSeesAction() async throws {
    let (session, run) = try await opened(viewer: TestViewer(owner))

    #expect(session.canTimeOut(chatter))
    #expect(!session.canTimeOut(ChatAuthor(id: owner, displayName: "jean_dupont")))
    run.cancel()
    await run.value
  }

  @Test("un viewer qui n'est pas propriétaire ne voit pas l'action de timeout", arguments: [UUID(), nil])
  func viewerSeesNoAction(viewer: UUID?) async throws {
    let moderation = FakeModeration()
    let (session, run) = try await opened(viewer: TestViewer(viewer), moderation: moderation)

    await session.timeOut(chatter)

    #expect(!session.canTimeOut(chatter))
    #expect(await moderation.calls.isEmpty)
    #expect(session.moderationNotice == nil)
    run.cancel()
    await run.value
  }

  @Test("un timeout réussi met l'auteur en timeout 10 minutes et le confirme dans le chat")
  func timedOut() async throws {
    let moderation = FakeModeration()
    let (session, run) = try await opened(viewer: TestViewer(owner), moderation: moderation)

    await session.timeOut(chatter)

    #expect(await moderation.calls == [TimeoutCall(user: chatter.id, channel: channel, duration: .seconds(600))])
    #expect(session.moderationNotice == .timedOut("yahway_810"))
    run.cancel()
    await run.value
  }

  @Test(
    "un timeout refusé le dit dans le chat",
    arguments: [
      (ServiceProblem(type: "about:blank", title: "Action non autorisée", status: 403, detail: nil) as any Error, ChatSession.ModerationNotice.forbidden),
      (ServiceProblem(type: "about:blank", title: "Chaîne introuvable", status: 404, detail: nil), .failed("yahway_810")),
      (URLError(.notConnectedToInternet), .failed("yahway_810")),
    ]
  )
  func refused(error: any Error, notice: ChatSession.ModerationNotice) async throws {
    let (session, run) = try await opened(viewer: TestViewer(owner), moderation: FakeModeration(failing: error))

    await session.timeOut(chatter)

    #expect(session.moderationNotice == notice)
    run.cancel()
    await run.value
  }

  @Test("pendant la recherche de la chaîne suivante, l'action de timeout n'est plus proposée")
  func noActionWhileLookingUp() async throws {
    let clock = TestClock(holding: [batchInterval, .seconds(1)])
    let channels = FakeChannels(owners: ["jean_dupont": owner], unreachable: ["marie_curie"])
    let session = makeSession(FakeConnector([.open(FakeConnection())]), clock: clock, channels: channels, viewer: TestViewer(owner))
    let first = try slug()
    let second = try ChannelSlug("marie_curie")
    let run = Task { await session.run(first) }
    try await waitUntil { session.status == .live && session.canTimeOut(chatter) }
    run.cancel()
    await run.value

    let next = Task { await session.run(second) }
    try await waitUntil { session.status == .reconnecting }

    #expect(!session.canTimeOut(chatter))
    next.cancel()
    await clock.fire(.seconds(1))
    await next.value
  }

  @Test("ouvrir une chaîne dont on n'est pas propriétaire retire l'action et l'avis")
  func resetsOnNextChannel() async throws {
    let connector = FakeConnector([.open(FakeConnection()), .open(FakeConnection())])
    let session = makeSession(connector, channels: FakeChannels(owners: ["jean_dupont": owner]), viewer: TestViewer(owner))
    let first = try slug()
    let second = try ChannelSlug("marie_curie")
    let run = Task { await session.run(first) }
    try await waitUntil { session.status == .live }
    await session.timeOut(chatter)
    run.cancel()
    await run.value

    let next = Task { await session.run(second) }
    try await waitUntil { await connector.tokens.count == 2 && session.status == .live }

    #expect(!session.canTimeOut(chatter))
    #expect(session.moderationNotice == nil)
    next.cancel()
    await next.value
  }

  @Test("l'action de timeout suit le compte connecté pendant que la chaîne est ouverte")
  func followsSignedInAccount() async throws {
    let viewer = TestViewer(nil)
    let (session, run) = try await opened(viewer: viewer)

    #expect(!session.canTimeOut(chatter))
    viewer.id = owner
    #expect(session.canTimeOut(chatter))
    viewer.id = nil
    #expect(!session.canTimeOut(chatter))
    run.cancel()
    await run.value
  }

  @Test("la réponse d'un timeout lancé sur une chaîne ne s'affiche pas dans la chaîne suivante")
  func noticeStaysOnItsChannel() async throws {
    let moderation = FakeModeration(holding: true)
    let connector = FakeConnector([.open(FakeConnection()), .open(FakeConnection())])
    let channels = FakeChannels(
      ids: ["marie_curie": ChannelID(UUID())],
      owners: ["jean_dupont": owner]
    )
    let session = makeSession(connector, channels: channels, moderation: moderation, viewer: TestViewer(owner))
    let first = try slug()
    let second = try ChannelSlug("marie_curie")
    let run = Task { await session.run(first) }
    try await waitUntil { session.status == .live }
    let pending = Task { await session.timeOut(chatter) }
    try await waitUntil { await moderation.calls.count == 1 }
    run.cancel()
    await run.value

    let next = Task { await session.run(second) }
    try await waitUntil { await connector.tokens.count == 2 && session.status == .live }
    await moderation.release()
    await pending.value

    #expect(session.moderationNotice == nil)
    next.cancel()
    await next.value
  }
}
