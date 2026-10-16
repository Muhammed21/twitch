// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "Packages",
  platforms: [.iOS(.v17)],
  products: [
    .library(name: "DesignSystem", targets: ["DesignSystem"]),
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
  ]
)
