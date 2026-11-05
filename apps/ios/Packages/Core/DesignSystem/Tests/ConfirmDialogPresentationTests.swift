import DesignSystem
import SwiftUI
import Testing
import UIKit

@MainActor
private func host(isPresented: Bool) -> UIWindow {
  let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 393, height: 852))
  let screen = NavigationStack {
    Color.clear
      .navigationTitle("Just Chatting")
      .confirmDialog(
        isPresented: isPresented,
        onDismiss: {},
        dialog: { ConfirmDialog(message: "Are you sure you want to unfollow Just Chatting?", actions: []) }
      )
  }
  window.rootViewController = UIHostingController(rootView: screen)
  window.makeKeyAndVisible()
  return window
}

@MainActor
private func presented(in window: UIWindow) async -> UIViewController? {
  for _ in 0 ..< 50 {
    if let shown = window.rootViewController?.presentedViewController { return shown }
    try? await Task.sleep(for: .milliseconds(20))
  }
  return nil
}

@MainActor
@Suite("L'alerte de confirmation couvre tout l'écran, barres comprises (chaine/page-chaine--modale-ne-plus-suivre)")
struct ConfirmDialogPresentationTests {
  @Test("ouverte, elle est présentée par-dessus la fenêtre entière, barre de navigation comprise")
  func coversWholeWindow() async throws {
    let window = host(isPresented: true)

    let shown = try #require(await presented(in: window))

    #expect([UIModalPresentationStyle.fullScreen, .overFullScreen].contains(shown.modalPresentationStyle))
    #expect(shown.view.frame == window.bounds)
  }

  @Test("fermée, rien n'est présenté")
  func closedPresentsNothing() async {
    let window = host(isPresented: false)

    #expect(await presented(in: window) == nil)
  }
}
