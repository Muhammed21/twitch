import DesignSystem
import SwiftUI

public struct WelcomeRow: Sendable, Equatable {
  public let leading: String
  public let main: String
  public let trailing: String
}

public enum WelcomeContent {
  public static let rows = [
    WelcomeRow(leading: "Fortnite VALORANT", main: "Games", trailing: "Call of Duty: Modern Warfare III"),
    WelcomeRow(leading: "Art Creative", main: "Music", trailing: "Electronic Punk Ambient"),
    WelcomeRow(leading: "Podcasts Interviews", main: "Talk Shows", trailing: "History Education Science"),
    WelcomeRow(leading: "Basketball Football", main: "Sports", trailing: "Baseball Soccer Tennis"),
    WelcomeRow(leading: "Kids Family Friendly", main: "Travel & Outdoors", trailing: "Animals Aquariums"),
    WelcomeRow(leading: "ASMR Co-working", main: "Just Chatting", trailing: "News Media Politics"),
    WelcomeRow(leading: "Baking Cooking", main: "Food & Drink", trailing: "Social Eating Wine"),
    WelcomeRow(leading: "Esports Festivals", main: "Special Events", trailing: "Sports Cards Charity"),
  ]
}

public struct WelcomeAction: Sendable, Equatable {
  public let title: String
  public let kind: ActionButtonKind
  public let intent: WelcomeIntent

  public init(title: String, kind: ActionButtonKind, intent: WelcomeIntent) {
    self.title = title
    self.kind = kind
    self.intent = intent
  }
}

public extension WelcomeContent {
  static var actions: [WelcomeAction] {
    [
      WelcomeAction(title: WelcomeText.logIn, kind: .secondaryOnAccent, intent: .logIn),
      WelcomeAction(title: WelcomeText.signUp, kind: .primaryOnAccent, intent: .signUp),
    ]
  }
}

public enum WelcomeText {
  public static var slogan: String { String(localized: "welcome.slogan", bundle: .module) }
  public static var logIn: String { String(localized: "welcome.logIn", bundle: .module) }
  public static var signUp: String { String(localized: "welcome.signUp", bundle: .module) }
}

public enum WelcomeEntrance {
  public static let rowDuration: TimeInterval = 0.6
  public static let stagger: TimeInterval = 0.05

  public static func offset(row: Int, at elapsed: TimeInterval, distance: CGFloat, reduceMotion: Bool) -> CGFloat {
    guard !reduceMotion else { return 0 }
    let progress = min(max((elapsed - Double(row) * stagger) / rowDuration, 0), 1)
    let remaining = pow(1 - progress, 3)
    let side: CGFloat = row.isMultiple(of: 2) ? -1 : 1
    return side * distance * remaining
  }

  public static func duration(rows: Int) -> TimeInterval {
    Double(rows - 1) * stagger + rowDuration
  }
}

public enum WelcomeIntent: Sendable {
  case logIn
  case signUp
}

private extension HorizontalAlignment {
  enum MainCategory: AlignmentID {
    static func defaultValue(in context: ViewDimensions) -> CGFloat {
      context[.leading]
    }
  }

  static let mainCategory = HorizontalAlignment(MainCategory.self)
}

public struct WelcomeScreen: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @State private var start = Date.now
  @State private var isEntering = true
  private let onIntent: @MainActor (WelcomeIntent) -> Void

  public init(onIntent: @escaping @MainActor (WelcomeIntent) -> Void) {
    self.onIntent = onIntent
  }

  public var body: some View {
    GeometryReader { proxy in
      VStack(alignment: .leading, spacing: 0) {
        Spacer(minLength: 0)
        TimelineView(.animation(paused: !isEntering)) { context in
          categories(at: context.date.timeIntervalSince(start), distance: proxy.size.width)
        }
        .accessibilityHidden(true)
        Text(WelcomeText.slogan)
          .font(TextRole.hero.font)
          .foregroundStyle(ColorRole.onAccentStrong.color)
          .padding(.top, LayoutRole.sloganGap.points)
          .padding(.bottom, LayoutRole.sloganBottom.points)
          .padding(.leading, LayoutRole.heroInset.points)
        Spacer(minLength: 0)
        HStack(spacing: LayoutRole.actionGap.points) {
          ForEach(WelcomeContent.actions, id: \.title) { action in
            Button(action.title) { onIntent(action.intent) }
              .buttonStyle(ActionButtonStyle(action.kind))
          }
        }
        .padding([.horizontal, .bottom], LayoutRole.actionInset.points)
      }
    }
    .background(ColorRole.accent.color.ignoresSafeArea())
    .task {
      try? await Task.sleep(for: .seconds(WelcomeEntrance.duration(rows: WelcomeContent.rows.count)))
      isEntering = false
    }
  }

  private func categories(at elapsed: TimeInterval, distance: CGFloat) -> some View {
    VStack(alignment: .mainCategory, spacing: LayoutRole.heroRowGap.points) {
      ForEach(Array(WelcomeContent.rows.enumerated()), id: \.offset) { index, row in
        HStack(alignment: .firstTextBaseline, spacing: 0) {
          Text(row.leading + " ")
            .foregroundStyle(ColorRole.onAccentMuted.color)
          Text(row.main)
            .foregroundStyle(ColorRole.onAccent.color)
            .alignmentGuide(.mainCategory) { $0[.leading] }
          Text(" " + row.trailing)
            .foregroundStyle(ColorRole.onAccentMuted.color)
        }
        .font(TextRole.hero.font)
        .lineLimit(1)
        .fixedSize()
        .offset(x: WelcomeEntrance.offset(row: index, at: elapsed, distance: distance, reduceMotion: reduceMotion))
      }
    }
    .frame(maxWidth: .infinity, alignment: Alignment(horizontal: .mainCategory, vertical: .center))
    .padding(.leading, LayoutRole.heroInset.points)
  }
}
