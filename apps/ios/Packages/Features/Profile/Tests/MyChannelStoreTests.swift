import Domain
import Foundation
import Profile
import Testing

@MainActor
private func makeStore(
  _ repository: FakeMyChannel,
  title: String = "Speedrun du dimanche",
  pasteboard: Pasteboard = Pasteboard(),
  log: LogBook = LogBook()
) -> MyChannelStore {
  MyChannelStore(
    repository: repository,
    channels: FakeChannels(title: title),
    copy: { pasteboard.copy($0) },
    log: { log.write($0) }
  )
}

@MainActor
@Suite("Ma chaîne : chaîne du compte, clé de stream et titre")
struct MyChannelStoreTests {
  @Test("charge la chaîne du compte avec son titre")
  func loads() async throws {
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel())))

    await store.load()

    #expect(try store.phase == .ready(makeOwnedChannel()))
    #expect(store.title == "Speedrun du dimanche")
  }

  @Test("dit que le compte n'a pas encore de chaîne")
  func noChannelYet() async {
    let store = makeStore(FakeMyChannel(owned: .success(nil)))

    await store.load()

    #expect(store.phase == .noChannel)
  }

  @Test("dit que la chaîne n'a pas pu être chargée")
  func loadFailed() async {
    let store = makeStore(FakeMyChannel(owned: .failure(URLError(.notConnectedToInternet))))

    await store.load()

    #expect(store.phase == .failed)
  }

  @Test("montre la clé de stream à la demande, puis la masque")
  func revealsAndHidesKey() async throws {
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel())))
    await store.load()
    #expect(store.streamKey == nil)

    await store.revealKey()
    #expect(store.streamKey?.revealed == secret)
    #expect(store.streamKey?.ingestURL == ingestURL)

    store.hideKey()
    #expect(store.streamKey == nil)
  }

  @Test("copie la clé montrée et le confirme")
  func copiesKey() async throws {
    let pasteboard = Pasteboard()
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel())), pasteboard: pasteboard)
    await store.load()
    await store.revealKey()

    store.copyKey()

    #expect(pasteboard.copied == [secret])
    #expect(store.notice == .keyCopied)
  }

  @Test("ne copie rien tant que la clé n'est pas montrée")
  func copiesNothingHidden() async throws {
    let pasteboard = Pasteboard()
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel())), pasteboard: pasteboard)
    await store.load()

    store.copyKey()

    #expect(pasteboard.copied.isEmpty)
    #expect(store.notice == nil)
  }

  @Test("dit que la clé n'a pas pu être lue")
  func keyUnavailable() async throws {
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel()), key: .failure(Refused())))
    await store.load()

    await store.revealKey()

    #expect(store.streamKey == nil)
    #expect(store.notice == .keyUnavailable)
  }

  @Test("change le titre de la chaîne et le confirme")
  func renames() async throws {
    let repository = try FakeMyChannel(owned: .success(makeOwnedChannel()))
    let store = makeStore(repository)
    await store.load()

    let saved = await store.rename(to: "Any% en 2 h")

    #expect(saved)
    #expect(await repository.renames == [RenameCall(channel: channelID, title: "Any% en 2 h")])
    #expect(store.title == "Any% en 2 h")
    #expect(store.notice == .titleSaved)
  }

  @Test("refuse un titre de plus de 140 caractères sans l'envoyer")
  func refusesLongTitle() async throws {
    let repository = try FakeMyChannel(owned: .success(makeOwnedChannel()))
    let store = makeStore(repository)
    await store.load()

    let saved = await store.rename(to: String(repeating: "a", count: 141))

    #expect(!saved)
    #expect(await repository.renames.isEmpty)
    #expect(store.title == "Speedrun du dimanche")
  }

  @Test("garde l'ancien titre et le dit quand le serveur refuse")
  func renameRefused() async throws {
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel()), renamed: .failure(Refused())))
    await store.load()

    let saved = await store.rename(to: "Nouveau titre")

    #expect(!saved)
    #expect(store.title == "Speedrun du dimanche")
    #expect(store.notice == .titleFailed)
  }

  @Test("compte les caractères restants du titre en graphèmes", arguments: [
    ("", 140),
    ("Fun Gaming Session", 122),
    ("café 👨‍👩‍👧", 134),
  ])
  func remaining(draft: String, expected: Int) {
    #expect(MyChannelStore.remaining(in: draft) == expected)
  }

  @Test("journalise la clé refusée par son statut, sans le problème du serveur qui la cite")
  func logsRefusalByStatus() async throws {
    let log = LogBook()
    let problem = ServiceProblem(type: "about:blank", title: "Refus", status: 403, detail: "clé \(secret)")
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel()), key: .failure(problem)), log: log)
    await store.load()

    await store.revealKey()

    #expect(log.entries == ["my channel: stream key not read (status 403)"])
  }

  @Test("la clé n'apparaît dans aucun log, sur aucun chemin")
  func keyNeverLogged() async throws {
    let log = LogBook()
    let shown = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel())), log: log)
    await shown.load()
    await shown.revealKey()
    shown.copyKey()
    shown.hideKey()
    let refused = try makeStore(
      FakeMyChannel(owned: .success(makeOwnedChannel()), key: .failure(Refused()), renamed: .failure(Refused())),
      log: log
    )
    await refused.load()
    await refused.revealKey()
    _ = await refused.rename(to: "Nouveau titre")
    let unreachable = makeStore(FakeMyChannel(owned: .failure(Refused())), log: log)
    await unreachable.load()

    #expect(!log.entries.isEmpty)
    #expect(log.entries.allSatisfy { !$0.contains(secret) })
  }
}
