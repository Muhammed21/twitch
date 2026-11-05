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

  init(source: any BootstrapSource, currentVersion: AppVersion) {
    self.source = source
    self.currentVersion = currentVersion
  }

  func run() async {
    guard let bootstrap = try? await source.bootstrap() else { return }
    flags = bootstrap.flags
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
