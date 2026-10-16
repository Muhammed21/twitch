// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "Packages",
  defaultLocalization: "en",
  platforms: [.iOS(.v17)],
  products: [
    .library(name: "DesignSystem", targets: ["DesignSystem"]),
    .library(name: "Onboarding", targets: ["Onboarding"]),
  ],
  dependencies: [
    .package(path: "../../../packages/design-tokens/platforms/swift"),
  ],
  targets: [
    .target(
      name: "DesignSystem",
      dependencies: [.product(name: "DesignTokens", package: "swift")],
      path: "Core/DesignSystem/Sources",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "DesignSystemTests",
      dependencies: ["DesignSystem"],
      path: "Core/DesignSystem/Tests",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .target(
      name: "Onboarding",
      dependencies: ["DesignSystem"],
      path: "Features/Onboarding/Sources",
      resources: [.process("Localizable.xcstrings")],
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "OnboardingTests",
      dependencies: ["Onboarding", "DesignSystem"],
      path: "Features/Onboarding/Tests",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
  ]
)
