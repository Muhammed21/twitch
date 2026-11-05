import Domain
import Onboarding
import Testing

private actor FakePermission: NotificationPermission {
  private var current: NotificationAuthorization
  private let answer: Bool?
  private(set) var requests = 0

  init(current: NotificationAuthorization, answer: Bool? = true) {
    self.current = current
    self.answer = answer
  }

  func authorization() async -> NotificationAuthorization {
    current
  }

  func request() async -> Bool? {
    requests += 1
    current = answer.map { $0 ? .granted : .denied } ?? current
    return answer
  }
}

@MainActor
private final class Answers {
  private(set) var all: [Bool] = []

  func record(_ isGranted: Bool) {
    all.append(isGranted)
  }
}

@MainActor
@Suite("Page 8 : notifications, l'alerte système derrière un protocole (ADR 0051 §1 et §7)")
struct NotificationChoicesTests {
  @Test("accepter l'alerte émet notification_permission:answered avec is_granted à true, refuser avec false", arguments: [true, false])
  func answers(isGranted: Bool) async {
    let permission = FakePermission(current: .notDetermined, answer: isGranted)
    let answers = Answers()
    let choices = NotificationChoices(permission: permission, onAnswer: { answers.record($0) })

    let result = await choices.turnOn()

    #expect(result == (isGranted ? .granted : .denied))
    #expect(answers.all == [isGranted])
    #expect(await permission.requests == 1)
  }

  @Test("une demande qui échoue sans réponse garde l'autorisation non décidée et n'émet rien")
  func requestFails() async {
    let permission = FakePermission(current: .notDetermined, answer: nil)
    let answers = Answers()
    let choices = NotificationChoices(permission: permission, onAnswer: { answers.record($0) })

    let result = await choices.turnOn()

    #expect(result == .notDetermined)
    #expect(choices.authorization == .notDetermined)
    #expect(answers.all.isEmpty)
  }

  @Test("une autorisation déjà décidée ne relance pas l'alerte et n'émet rien", arguments: [NotificationAuthorization.granted, .denied])
  func alreadyDecided(current: NotificationAuthorization) async {
    let permission = FakePermission(current: current)
    let answers = Answers()
    let choices = NotificationChoices(permission: permission, onAnswer: { answers.record($0) })

    let result = await choices.turnOn()

    #expect(result == current)
    #expect(answers.all.isEmpty)
    #expect(await permission.requests == 0)
  }

  @Test("la page relit l'autorisation du système à son arrivée")
  func load() async {
    let choices = NotificationChoices(permission: FakePermission(current: .denied), onAnswer: { _ in })
    #expect(choices.authorization == nil)

    await choices.load()

    #expect(choices.authorization == .denied)
  }

  @Test(
    "une autorisation déjà décidée passe la page dans le sens du parcours ; non décidée, la page reste",
    arguments: [
      (NotificationAuthorization.granted, JourneyDirection.forward, NotificationPass.skip),
      (.denied, .forward, .skip),
      (.granted, .backward, .back),
      (.denied, .backward, .back),
    ]
  )
  func pass(authorization: NotificationAuthorization, direction: JourneyDirection, expected: NotificationPass) {
    #expect(NotificationPass(authorization: authorization, direction: direction) == expected)
  }

  @Test("une autorisation non décidée garde la page, dans les deux sens", arguments: [JourneyDirection.forward, .backward])
  func stays(direction: JourneyDirection) {
    #expect(NotificationPass(authorization: .notDetermined, direction: direction) == nil)
  }
}
