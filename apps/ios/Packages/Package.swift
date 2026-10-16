// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "Packages",
  defaultLocalization: "en",
  platforms: [.iOS(.v17)],
  products: [
    .library(name: "DesignSystem", targets: ["DesignSystem"]),
    .library(name: "Onboarding", targets: ["Onboarding"]),
    .library(name: "Auth", targets: ["Auth"]),
    .library(name: "Domain", targets: ["Domain"]),
    .library(name: "Networking", targets: ["Networking"]),
  ],
  dependencies: [
    .package(path: "../../../packages/design-tokens/platforms/swift"),
    .package(url: "https://github.com/apple/swift-openapi-generator", exact: "1.13.1"),
    .package(url: "https://github.com/apple/swift-openapi-runtime", exact: "1.12.2"),
    .package(url: "https://github.com/apple/swift-http-types", exact: "1.8.0"),
  ],
  targets: [
    .target(
      name: "Domain",
      path: "Domain/Sources",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .target(
      name: "Networking",
      dependencies: [
        "Domain",
        .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
        .product(name: "HTTPTypes", package: "swift-http-types"),
      ],
      path: "Core/Networking/Sources",
      swiftSettings: [.swiftLanguageMode(.v6)],
      plugins: [.plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator")]
    ),
    .testTarget(
      name: "NetworkingTests",
      dependencies: ["Networking", "Domain"],
      path: "Core/Networking/Tests",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
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
    .target(
      name: "Auth",
      dependencies: ["Domain", "Networking", "DesignSystem"],
      path: "Features/Auth/Sources",
      resources: [.process("Localizable.xcstrings")],
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "AuthTests",
      dependencies: ["Auth", "Domain", "Networking", "DesignSystem"],
      path: "Features/Auth/Tests",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
  ]
)
