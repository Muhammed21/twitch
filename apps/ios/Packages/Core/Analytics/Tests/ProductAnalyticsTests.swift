import Analytics
import Domain
import Foundation
import Testing

@MainActor
final class RecordingBackend: AnalyticsBackend {
  enum Call: Equatable {
    case capture(String, [String: AnalyticsValue])
    case identify(String)
    case reset
  }

  private(set) var calls: [Call] = []

  func capture(_ name: String, properties: [String: AnalyticsValue]) {
    calls.append(.capture(name, properties))
  }

  func identify(_ distinctID: String) {
    calls.append(.identify(distinctID))
  }

  func reset() {
    calls.append(.reset)
  }
}

private let viewerID = UUID(uuidString: "6F9619FF-8B86-D011-B42D-00C04FC964FF")!
private let otherViewerID = UUID(uuidString: "0B1D2E3F-4A5B-4C6D-8E7F-9A0B1C2D3E4F")!

@MainActor
private func makeDefaults() -> UserDefaults {
  UserDefaults(suiteName: "analytics-tests-\(UUID().uuidString)")!
}

@MainActor
@Suite("Analytics produit : capture et identity stitching (ADR 0012, §2)")
struct ProductAnalyticsTests {
  @Test("un événement part avec son nom de taxonomie et ses propriétés snake_case")
  func capture() {
    let backend = RecordingBackend()
    let analytics = ProductAnalytics(backend: backend, defaults: makeDefaults())

    analytics.capture(.onboardingStepCompleted(step: "categories", durationMs: 1200))

    #expect(backend.calls == [.capture("onboarding:step_completed", ["step": .string("categories"), "duration_ms": .int(1200)])])
  }

  @Test("la première connexion identifie l'utilisateur par son ID backend, en minuscules")
  func firstIdentify() {
    let backend = RecordingBackend()
    let analytics = ProductAnalytics(backend: backend, defaults: makeDefaults())

    analytics.identify(viewerID)

    #expect(backend.calls == [.identify("6f9619ff-8b86-d011-b42d-00c04fc964ff")])
  }

  @Test("identify() n'est appelé qu'une fois pour un même utilisateur, même après un relancement")
  func identifyOnce() {
    let defaults = makeDefaults()
    let backend = RecordingBackend()
    ProductAnalytics(backend: backend, defaults: defaults).identify(viewerID)
    let relaunched = ProductAnalytics(backend: backend, defaults: defaults)

    relaunched.identify(viewerID)
    relaunched.identify(viewerID)

    #expect(backend.calls == [.identify("6f9619ff-8b86-d011-b42d-00c04fc964ff")])
  }

  @Test("reset() au logout, puis la connexion suivante identifie de nouveau")
  func resetThenIdentify() {
    let backend = RecordingBackend()
    let analytics = ProductAnalytics(backend: backend, defaults: makeDefaults())
    analytics.identify(viewerID)

    analytics.reset()
    analytics.identify(viewerID)

    #expect(backend.calls == [
      .identify("6f9619ff-8b86-d011-b42d-00c04fc964ff"),
      .reset,
      .identify("6f9619ff-8b86-d011-b42d-00c04fc964ff"),
    ])
  }

  @Test("reset() est envoyé même si l'app ne connaissait aucune identité")
  func resetAlways() {
    let backend = RecordingBackend()
    let analytics = ProductAnalytics(backend: backend, defaults: makeDefaults())

    analytics.reset()

    #expect(backend.calls == [.reset])
  }

  @Test("un autre utilisateur sans logout passe par reset() avant identify(), pour ne pas fusionner deux profils")
  func switchingUsers() {
    let backend = RecordingBackend()
    let analytics = ProductAnalytics(backend: backend, defaults: makeDefaults())
    analytics.identify(viewerID)

    analytics.identify(otherViewerID)

    #expect(backend.calls == [
      .identify("6f9619ff-8b86-d011-b42d-00c04fc964ff"),
      .reset,
      .identify("0b1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f"),
    ])
  }
}
