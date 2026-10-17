import DesignSystem
import SwiftUI

public enum AllSetIllustration {
  public static var url: URL? { Bundle.module.url(forResource: "you-are-all-set", withExtension: "png") }
}

public struct AllSetScreen: View {
  @Environment(SessionStore.self) private var session

  public init() {}

  public var body: some View {
    VStack(spacing: 0) {
      Text(AuthText.accountVerification)
        .font(TextRole.display.font)
        .frame(maxWidth: .infinity, alignment: .leading)
      illustration
        .padding(.top, LayoutRole.heroInset.points)
      Text(AuthText.allSetTitle)
        .font(TextRole.dialogTitle.font)
        .padding(.top, LayoutRole.actionInset.points)
      Text(AuthText.allSetMessage)
        .font(TextRole.dialogMessage.font)
        .padding(.top, LayoutRole.sloganGap.points)
      Button {
        session.finishGreeting()
      } label: {
        Text(AuthText.done).padding(.horizontal, LayoutRole.dialogPadding.points)
      }
      .buttonStyle(ActionButtonStyle(.primary))
      .fixedSize()
      .frame(maxWidth: .infinity, alignment: .trailing)
      .padding(.top, LayoutRole.heroInset.points)
      Spacer(minLength: 0)
    }
    .multilineTextAlignment(.center)
    .foregroundStyle(ColorRole.textPrimary.color)
    .padding(LayoutRole.screenInset.points)
    .background(ColorRole.background.color.ignoresSafeArea())
  }

  @ViewBuilder private var illustration: some View {
    if let url = AllSetIllustration.url, let image = UIImage(contentsOfFile: url.path()) {
      Image(uiImage: image)
        .accessibilityHidden(true)
    }
  }
}
