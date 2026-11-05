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

  @Test("un bootstrap en échec laisse démarrer l'app avec les défauts sûrs")
  func failureKeepsDefaults() async throws {
    let store = try LaunchStore(source: FakeBootstrap(result: .failure(BootstrapDown())), currentVersion: AppVersion("1.4.0"))

    await store.run()

    #expect(store.flags == .safeDefaults)
    #expect(!store.isUpdateRequired)
    #expect(store.entitlements.isEmpty)
  }
}
