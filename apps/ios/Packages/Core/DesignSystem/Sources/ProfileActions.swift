import SwiftUI

public struct ProfileAboutEmpty: View {
  public static let illustration = Illustration.characterOnPurple

  private let title: String
  private let message: String

  public init(title: String, message: String) {
    self.title = title
    self.message = message
  }

  public var body: some View {
    VStack(spacing: LayoutRole.profileAboutIllustrationGap.points) {
      IllustrationImage(Self.illustration)
      VStack(spacing: LayoutRole.profileAboutTextGap.points) {
        Text(title)
          .font(TextRole.profileAboutTitle.font)
          .foregroundStyle(ProfileHeaderStyle.aboutTitle.color)
          .accessibilityAddTraits(.isHeader)
        Text(message)
          .font(TextRole.profileAboutMessage.font)
          .foregroundStyle(ProfileHeaderStyle.aboutMessage.color)
      }
    }
    .multilineTextAlignment(.center)
    .padding(.top, LayoutRole.profileAboutTop.points)
    .padding(.horizontal, LayoutRole.profileAboutInset.points)
    .frame(maxWidth: .infinity)
  }
}

public struct ProfileActionButton: View {
  private let label: String
  private let glyph: Glyph?
  private let action: () -> Void

  public init(label: String, glyph: Glyph? = nil, action: @escaping () -> Void) {
    self.label = label
    self.glyph = glyph
    self.action = action
  }

  public var body: some View {
    Button(action: action) {
      HStack(spacing: LayoutRole.profileActionGlyphGap.points) {
        if let glyph {
          glyph.image
            .resizable()
            .scaledToFit()
            .frame(width: LayoutRole.profileActionGlyph.points, height: LayoutRole.profileActionGlyph.points)
            .accessibilityHidden(true)
        }
        Text(label)
          .font(TextRole.profileAction.font)
      }
      .foregroundStyle(ProfileHeaderStyle.onAction.color)
      .padding(.horizontal, LayoutRole.screenInset.points)
      .frame(maxWidth: .infinity, minHeight: LayoutRole.profileActionHeight.points)
      .background(ProfileHeaderStyle.action.color, in: Capsule())
      .contentShape(Capsule())
    }
    .buttonStyle(.plain)
  }
}
