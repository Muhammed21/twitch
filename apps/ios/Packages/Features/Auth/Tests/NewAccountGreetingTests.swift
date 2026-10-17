import Auth
import Testing

@MainActor
@Suite("Accueil du nouveau compte : « You're All Set! » après l'inscription", .timeLimit(.minutes(1)))
struct NewAccountGreetingTests {
  @Test("une inscription réussie accueille le nouveau compte avec « You're All Set! »")
  func signUpGreets() async {
    let harness = Harness(reply: approved)
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.signIn(.signUp)

    #expect(harness.store.phase == .signedIn(viewer))
    #expect(harness.store.isGreetingNewAccount)
  }

  @Test("une connexion réussie n'accueille pas de nouveau compte")
  func logInDoesNotGreet() async {
    let harness = Harness(reply: approved)
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.signIn(.signIn)

    #expect(harness.store.isGreetingNewAccount == false)
  }

  @Test("une inscription annulée n'accueille pas de nouveau compte")
  func canceledSignUpDoesNotGreet() async {
    let harness = Harness(reply: canceled)
    let running = await harness.launch()
    defer { running.cancel() }

    await harness.store.signIn(.signUp)

    #expect(harness.store.isGreetingNewAccount == false)
  }

  @Test("Done referme l'accueil et laisse l'app connectée")
  func doneEndsGreeting() async throws {
    let harness = Harness(reply: approved)
    let running = await harness.launch()
    defer { running.cancel() }
    await harness.store.signIn(.signUp)
    try #require(harness.store.isGreetingNewAccount)

    harness.store.finishGreeting()

    #expect(harness.store.isGreetingNewAccount == false)
    #expect(harness.store.phase == .signedIn(viewer))
  }

  @Test("une session perdue pendant l'accueil ramène à l'accueil sans le garder pour la connexion suivante")
  func signedOutEndsGreeting() async throws {
    let harness = Harness(reply: approved)
    let running = await harness.launch()
    defer { running.cancel() }
    await harness.store.signIn(.signUp)
    try #require(harness.store.isGreetingNewAccount)

    await harness.store.resolveLogOut(.logOut)

    #expect(await eventually { harness.store.phase == .signedOut })
    #expect(harness.store.isGreetingNewAccount == false)
  }
}
