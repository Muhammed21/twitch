// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "Packages",
  defaultLocalization: "en",
  platforms: [.iOS(.v17)],
  products: [
    .library(name: "DesignSystem", targets: ["DesignSystem"]),
    .library(
      name: "Onboarding",
      targets: ["Onboarding", "Preferences", "Home", "Navigation", "Player", "Channel", "ChatTransport", "Chat", "Profile", "Purchases"]
    ),
    .library(name: "Auth", targets: ["Auth"]),
    .library(name: "Domain", targets: ["Domain"]),
    .library(name: "Networking", targets: ["Networking"]),
  ],
  dependencies: [
    .package(path: "../../../packages/design-tokens/platforms/swift"),
    .package(url: "https://github.com/apple/swift-openapi-generator", exact: "1.13.1"),
    .package(url: "https://github.com/apple/swift-openapi-runtime", exact: "1.12.2"),
    .package(url: "https://github.com/apple/swift-http-types", exact: "1.8.0"),
    .package(url: "https://github.com/RevenueCat/purchases-ios-spm", exact: "5.96.1"),
  ],
  targets: [
    .target(
      name: "Domain",
      path: "Domain/Sources",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "DomainTests",
      dependencies: ["Domain"],
      path: "Domain/Tests",
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
      name: "ChatTransport",
      dependencies: [
        "Domain",
        .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
      ],
      path: "Core/ChatTransport/Sources",
      swiftSettings: [.swiftLanguageMode(.v6)],
      plugins: [.plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator")]
    ),
    .testTarget(
      name: "ChatTransportTests",
      dependencies: ["ChatTransport", "Domain"],
      path: "Core/ChatTransport/Tests",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .target(
      name: "Preferences",
      dependencies: ["Domain"],
      path: "Core/Preferences/Sources",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "PreferencesTests",
      dependencies: ["Preferences", "Domain"],
      path: "Core/Preferences/Tests",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .target(
      name: "Navigation",
      dependencies: ["Domain"],
      path: "Core/Navigation/Sources",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "NavigationTests",
      dependencies: ["Navigation", "Domain"],
      path: "Core/Navigation/Tests",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .target(
      name: "Home",
      dependencies: ["Domain", "Navigation", "DesignSystem"],
      path: "Features/Home/Sources",
      resources: [.process("Localizable.xcstrings")],
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "HomeTests",
      dependencies: ["Home", "Domain", "Navigation"],
      path: "Features/Home/Tests",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .target(
      name: "Player",
      dependencies: ["Domain", "DesignSystem"],
      path: "Features/Player/Sources",
      resources: [.process("Localizable.xcstrings")],
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "PlayerTests",
      dependencies: ["Player", "Domain"],
      path: "Features/Player/Tests",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .target(
      name: "Channel",
      dependencies: ["Domain", "DesignSystem"],
      path: "Features/Channel/Sources",
      resources: [.process("Localizable.xcstrings")],
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "ChannelTests",
      dependencies: ["Channel", "Domain"],
      path: "Features/Channel/Tests",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .target(
      name: "Chat",
      dependencies: ["Domain", "DesignSystem"],
      path: "Features/Chat/Sources",
      resources: [.process("Localizable.xcstrings")],
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "ChatTests",
      dependencies: ["Chat", "Domain", "DesignSystem"],
      path: "Features/Chat/Tests",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .target(
      name: "DesignSystem",
      dependencies: [.product(name: "DesignTokens", package: "swift")],
      path: "Core/DesignSystem/Sources",
      exclude: ["glyphs.json"],
      resources: [.process("Glyphs.xcassets"), .copy("Sounds")],
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
      resources: [.process("Localizable.xcstrings"), .copy("Resources/you-are-all-set.png")],
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "AuthTests",
      dependencies: ["Auth", "Domain", "Networking", "DesignSystem"],
      path: "Features/Auth/Tests",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .target(
      name: "Profile",
      dependencies: ["Domain", "DesignSystem"],
      path: "Features/Profile/Sources",
      resources: [.process("Localizable.xcstrings")],
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "ProfileTests",
      dependencies: ["Profile", "Domain"],
      path: "Features/Profile/Tests",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .target(
      name: "Purchases",
      dependencies: ["Domain", .product(name: "RevenueCat", package: "purchases-ios-spm")],
      path: "Core/Purchases/Sources",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .target(
      name: "PurchasesTesting",
      dependencies: ["Domain"],
      path: "Core/Purchases/Testing",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
    .testTarget(
      name: "PurchasesTests",
      dependencies: ["Purchases", "PurchasesTesting", "Domain", .product(name: "RevenueCat", package: "purchases-ios-spm")],
      path: "Core/Purchases/Tests",
      swiftSettings: [.swiftLanguageMode(.v6)]
    ),
  ]
)
