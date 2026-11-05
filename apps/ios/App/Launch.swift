import DesignSystem
import Domain
import Observation
import SwiftUI

@MainActor
@Observable
final class LaunchStore {
  private(set) var flags = FeatureFlags.safeDefaults
  private(set) var isUpdateRequired = false
  private(set) var entitlements: [Entitlement] = []

  private let source: any BootstrapSource
  private let currentVersion: AppVersion
  private var variantAccountID: UUID?

  init(source: any BootstrapSource, currentVersion: AppVersion) {
    self.source = source
    self.currentVersion = currentVersion
  }

  func run(accountID: UUID? = nil) async {
    let bootstrap = try? await source.bootstrap()
    guard !Task.isCancelled else { return }
    let sameAccount = accountID == variantAccountID
    let frozenVariant = sameAccount ? flags.paywallVariant : nil
    variantAccountID = accountID
    guard let bootstrap else {
      flags = FeatureFlags(sessionReplay: flags.sessionReplay, paywallVariant: frozenVariant)
      if !sameAccount {
        entitlements = []
      }
      return
    }
    flags = FeatureFlags(
      sessionReplay: bootstrap.flags.sessionReplay,
      paywallVariant: frozenVariant ?? bootstrap.flags.paywallVariant
    )
    entitlements = bootstrap.entitlements
    isUpdateRequired = currentVersion < bootstrap.minSupportedVersion
  }
}

struct UpdateRequiredScreen: View {
  var body: some View {
    VStack(spacing: LayoutRole.dialogTitleGap.points) {
      Text("launch.updateRequired.title")
        .font(TextRole.display.font)
        .foregroundStyle(ColorRole.textPrimary.color)
      Text("launch.updateRequired.message")
        .font(TextRole.body.font)
        .foregroundStyle(ColorRole.textSecondary.color)
    }
    .multilineTextAlignment(.center)
    .padding(LayoutRole.screenInset.points)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(ColorRole.background.color.ignoresSafeArea())
  }
}
