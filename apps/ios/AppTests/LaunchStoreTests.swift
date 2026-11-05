import Domain
import Foundation
import Testing
@testable import Twitch

private struct BootstrapDown: Error {}

private struct FakeBootstrap: BootstrapSource {
  let result: Result<AppBootstrap, BootstrapDown>

  func bootstrap() async throws -> AppBootstrap {
    try result.get()
  }
}

private func bootstrap(minimum: String, sessionReplay: Bool = false, entitlements: [Entitlement] = []) throws -> FakeBootstrap {
  try FakeBootstrap(result: .success(AppBootstrap(
    minSupportedVersion: AppVersion(minimum),
    flags: FeatureFlags(sessionReplay: sessionReplay),
    entitlements: entitlements
  )))
}

private let turbo = Entitlement(scope: .platform, expiresAt: Date(timeIntervalSince1970: 1_796_720_400))

private actor SequencedBootstrap: BootstrapSource {
  private var replies: [String?]

  init(variants: [String?]) {
    replies = variants
  }

  func bootstrap() async throws -> AppBootstrap {
    let variant = replies.isEmpty ? nil : replies.removeFirst()
    return try AppBootstrap(minSupportedVersion: AppVersion("1.0.0"), flags: FeatureFlags(sessionReplay: false, paywallVariant: variant))
  }
}

private let viewerID = UUID(uuidString: "6F9619FF-8B86-D011-B42D-00C04FC964FF")!
private let otherViewerID = UUID(uuidString: "0B1D2E3F-4A5B-4C6D-8E7F-9A0B1C2D3E4F")!

private actor BootstrapThenFailure: BootstrapSource {
  private var hasReplied = false
  private let variant: String

  init(variant: String) {
    self.variant = variant
  }

  func bootstrap() async throws -> AppBootstrap {
    guard !hasReplied else { throw BootstrapDown() }
    hasReplied = true
    return try AppBootstrap(
      minSupportedVersion: AppVersion("1.0.0"),
      flags: FeatureFlags(sessionReplay: false, paywallVariant: variant),
      entitlements: [turbo]
    )
  }
}

private struct CancelledWhileWaiting: BootstrapSource {
  func bootstrap() async throws -> AppBootstrap {
    withUnsafeCurrentTask { task in task?.cancel() }
    return try AppBootstrap(minSupportedVersion: AppVersion("9.0.0"), flags: FeatureFlags(sessionReplay: true, paywallVariant: "control"))
  }
}

private func bootstrapThenFailure(variant: String) -> BootstrapThenFailure {
  BootstrapThenFailure(variant: variant)
}

@MainActor
@Suite("Bootstrap au lancement (ADR 0009, kill switch)")
struct LaunchStoreTests {
  @Test("avant la réponse, l'app tourne avec les défauts sûrs et sans écran de mise à jour")
  func beforeResponse() throws {
    let store = try LaunchStore(source: bootstrap(minimum: "9.0.0"), currentVersion: AppVersion("1.4.0"))

    #expect(store.flags == .safeDefaults)
    #expect(!store.isUpdateRequired)
  }

  @Test("une version minimale supérieure à celle de l'app demande la mise à jour", arguments: ["1.4.1", "1.5.0", "2.0.0"])
  func updateRequired(minimum: String) async throws {
    let store = try LaunchStore(source: bootstrap(minimum: minimum), currentVersion: AppVersion("1.4.0"))

    await store.run()

    #expect(store.isUpdateRequired)
  }

  @Test("une version minimale égale ou inférieure laisse démarrer l'app", arguments: ["1.4.0", "1.3.9", "0.1.0"])
  func supported(minimum: String) async throws {
    let store = try LaunchStore(source: bootstrap(minimum: minimum), currentVersion: AppVersion("1.4.0"))

    await store.run()

    #expect(!store.isUpdateRequired)
  }

  @Test("les flags évalués par le serveur remplacent les défauts")
  func appliesFlags() async throws {
    let store = try LaunchStore(source: bootstrap(minimum: "1.0.0", sessionReplay: true), currentVersion: AppVersion("1.4.0"))

    await store.run()

    #expect(store.flags == FeatureFlags(sessionReplay: true))
  }

  @Test("les entitlements rendus par le serveur sont transportés")
  func carriesEntitlements() async throws {
    let store = try LaunchStore(source: bootstrap(minimum: "1.0.0", entitlements: [turbo]), currentVersion: AppVersion("1.4.0"))

    await store.run()

    #expect(store.entitlements == [turbo])
  }

  @Test("un bootstrap en échec après un changement de compte ne garde pas les entitlements du compte précédent")
  func entitlementsForgottenAfterAccountChange() async throws {
    let store = try LaunchStore(source: bootstrapThenFailure(variant: "control"), currentVersion: AppVersion("1.4.0"))

    await store.run(accountID: viewerID)
    await store.run(accountID: otherViewerID)

    #expect(store.entitlements.isEmpty)
  }

  @Test("un bootstrap en échec pour le même compte garde ses entitlements")
  func entitlementsKeptOnFailureForSameAccount() async throws {
    let store = try LaunchStore(source: bootstrapThenFailure(variant: "control"), currentVersion: AppVersion("1.4.0"))

    await store.run(accountID: viewerID)
    await store.run(accountID: viewerID)

    #expect(store.entitlements == [turbo])
  }

  @Test("la variante du paywall reçue est figée pour la session du compte (ADR 0016)")
  func variantFrozen() async throws {
    let store = try LaunchStore(source: SequencedBootstrap(variants: ["control", "variant_b"]), currentVersion: AppVersion("1.4.0"))

    await store.run(accountID: viewerID)
    await store.run(accountID: viewerID)

    #expect(store.flags.paywallVariant == "control")
  }

  @Test("le bootstrap rejoué après la connexion apporte la variante que le bootstrap anonyme n'avait pas")
  func variantAfterSignIn() async throws {
    let store = try LaunchStore(source: SequencedBootstrap(variants: [nil, "variant_b"]), currentVersion: AppVersion("1.4.0"))

    await store.run(accountID: nil)
    await store.run(accountID: viewerID)

    #expect(store.flags.paywallVariant == "variant_b")
  }

  @Test("la déconnexion oublie la variante du compte : un compte anonyme n'en a pas")
  func variantForgottenAtSignOut() async throws {
    let store = try LaunchStore(source: SequencedBootstrap(variants: ["control", nil]), currentVersion: AppVersion("1.4.0"))

    await store.run(accountID: viewerID)
    await store.run(accountID: nil)

    #expect(store.flags.paywallVariant == nil)
  }

  @Test("un autre compte reçoit sa propre variante")
  func variantPerAccount() async throws {
    let store = try LaunchStore(source: SequencedBootstrap(variants: ["control", "variant_b"]), currentVersion: AppVersion("1.4.0"))

    await store.run(accountID: viewerID)
    await store.run(accountID: otherViewerID)

    #expect(store.flags.paywallVariant == "variant_b")
  }

  @Test("un bootstrap en échec après un changement de compte ne garde pas la variante du compte précédent")
  func failureAfterAccountChange() async throws {
    let store = try LaunchStore(source: bootstrapThenFailure(variant: "control"), currentVersion: AppVersion("1.4.0"))

    await store.run(accountID: viewerID)
    await store.run(accountID: otherViewerID)

    #expect(store.flags.paywallVariant == nil)
  }

  @Test("un bootstrap annulé par le changement de compte n'écrit rien : la relance du nouveau compte décide")
  func cancelledRunWritesNothing() async throws {
    let store = try LaunchStore(source: CancelledWhileWaiting(), currentVersion: AppVersion("1.4.0"))

    await Task { await store.run(accountID: viewerID) }.value

    #expect(store.flags == .safeDefaults)
    #expect(!store.isUpdateRequired)
  }

  @Test("un bootstrap en échec laisse démarrer l'app avec les défauts sûrs")
  func failureKeepsDefaults() async throws {
    let store = try LaunchStore(source: FakeBootstrap(result: .failure(BootstrapDown())), currentVersion: AppVersion("1.4.0"))

    await store.run()

    #expect(store.flags == .safeDefaults)
    #expect(!store.isUpdateRequired)
    #expect(store.entitlements.isEmpty)
  }
}
