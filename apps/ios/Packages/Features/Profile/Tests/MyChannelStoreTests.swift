import Domain
import Foundation
import Profile
import Testing

@MainActor
private func makeStore(
  _ repository: any MyChannelRepository,
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

  @Test("charge la chaîne au premier affichage du Stream Manager, même sans passer par Profile")
  func loadsWhenNeverLoaded() async throws {
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel())))

    await store.loadIfNeeded()

    #expect(try store.phase == .ready(makeOwnedChannel()))
  }

  @Test("ne recharge pas une chaîne déjà chargée : la clé montrée reste visible")
  func keepsLoadedChannel() async throws {
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel())))
    await store.load()
    await store.revealKey()

    await store.loadIfNeeded()

    #expect(store.streamKey?.revealed == secret)
  }

  @Test("oublie la chaîne, le titre et la clé à la fin de session, puis recharge celle du compte suivant")
  func resetsAtSessionEnd() async throws {
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel())))
    await store.load()
    await store.revealKey()

    store.reset()

    #expect(store.phase == .loading)
    #expect(store.title.isEmpty)
    #expect(store.streamKey == nil)

    await store.loadIfNeeded()

    #expect(try store.phase == .ready(makeOwnedChannel()))
  }

  @Test("remplace la clé par une nouvelle, montrée aussitôt, et le dit")
  func rotatesKey() async throws {
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel())))
    await store.load()

    await store.rotateKey()

    #expect(store.streamKey?.revealed == rotatedSecret)
    #expect(store.notice == .keyRotated)
  }

  @Test("garde la clé montrée et le dit quand la rotation échoue, sans écrire la clé dans le log")
  func rotationFails() async throws {
    let log = LogBook()
    let store = try makeStore(
      FakeMyChannel(owned: .success(makeOwnedChannel()), rotated: .failure(Refused())),
      log: log
    )
    await store.load()
    await store.revealKey()

    await store.rotateKey()

    #expect(store.streamKey?.revealed == secret)
    #expect(store.notice == .keyRotationFailed)
    #expect(log.entries.contains { $0.contains("stream key not rotated") })
    #expect(!log.entries.contains { $0.contains(secret) })
  }

  @Test("garde la nouvelle clé quand l'ancienne arrive après la rotation")
  func rotationDuringRead() async {
    let repository = HeldKey()
    let store = makeStore(repository)
    await store.load()
    let reveal = Task { await store.revealKey() }
    await repository.untilAsked()

    await store.rotateKey()
    await repository.answer()
    await reveal.value

    #expect(store.streamKey?.revealed == rotatedSecret)
  }

  @Test("ne fait rien tant que la chaîne n'est pas chargée")
  func rotationNeedsChannel() async {
    let store = makeStore(FakeMyChannel(owned: .success(nil)))
    await store.load()

    await store.rotateKey()

    #expect(store.streamKey == nil)
    #expect(store.notice == nil)
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

  @Test("garde la clé masquée quand on la masque pendant sa lecture")
  func hiddenDuringRead() async {
    let repository = HeldKey()
    let store = makeStore(repository)
    await store.load()
    let reveal = Task { await store.revealKey() }
    await repository.untilAsked()

    store.hideKey()
    await repository.answer()
    await reveal.value

    #expect(store.streamKey == nil)
  }

  @Test("oublie la clé lue pendant un rechargement, comme au changement de compte")
  func reloadDuringRead() async {
    let repository = HeldKey()
    let store = makeStore(repository)
    await store.load()
    let reveal = Task { await store.revealKey() }
    await repository.untilAsked()

    await store.load()
    await repository.answer()
    await reveal.value

    #expect(store.streamKey == nil)
  }

  @Test("oublie la clé montrée et l'avis au rechargement")
  func reloadForgetsKeyAndNotice() async throws {
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel())))
    await store.load()
    await store.revealKey()
    store.copyKey()

    await store.load()

    #expect(store.streamKey == nil)
    #expect(store.notice == nil)
  }

  @Test("masque la clé et efface l'avis en quittant l'écran")
  func leaves() async throws {
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel())))
    await store.load()
    await store.revealKey()
    store.copyKey()

    store.leave()

    #expect(store.streamKey == nil)
    #expect(store.notice == nil)
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

  @Test("compte les caractères restants du titre en graphèmes, sans les espaces retirés par l'API", arguments: [
    ("", 140),
    ("Fun Gaming Session", 122),
    ("café 👨‍👩‍👧", 134),
    (" \n" + String(repeating: "a", count: 140) + " ", 0),
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

  @Test("journalise le titre refusé par son statut")
  func logsRenameRefusalByStatus() async throws {
    let log = LogBook()
    let problem = ServiceProblem(type: "about:blank", title: "Refus", status: 422, detail: "titre refusé")
    let store = try makeStore(FakeMyChannel(owned: .success(makeOwnedChannel()), renamed: .failure(problem)), log: log)
    await store.load()

    _ = await store.rename(to: "Nouveau titre")

    #expect(log.entries == ["my channel: title not saved (status 422)"])
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
