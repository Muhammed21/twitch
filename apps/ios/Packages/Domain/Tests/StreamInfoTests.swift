import Domain
import Foundation
import Testing

private func makeInfo(tags: [String] = []) -> StreamInfo {
  StreamInfo(title: "", category: nil, tags: tags, language: .english, contentLabels: [], isBrandedContent: false)
}

@Suite("Infos du stream (IMG_9628, IMG_9629)")
struct StreamInfoTests {
  @Test("une chaîne porte au plus 10 tags de 25 caractères, comme l'API")
  func limits() {
    #expect(ChannelTag.maxCount == 10)
    #expect(ChannelTag.maxLength == 25)
  }

  @Test(
    "un tag saisi est mis en minuscules, sans accents ni espaces de bord",
    arguments: [(" Français ", "francais"), ("SpeedRun", "speedrun"), ("fps2", "fps2"), ("日本語", "日本語"), ("ゲーム", "ゲーム")]
  )
  func normalizes(raw: String, expected: String) {
    #expect(ChannelTag.normalized(raw) == expected)
  }

  @Test("un tag de 25 caractères est accepté")
  func acceptsLongest() {
    #expect(ChannelTag.normalized(String(repeating: "a", count: 25)) == String(repeating: "a", count: 25))
  }

  @Test(
    "un tag hors format est refusé",
    arguments: [
      String(repeating: "a", count: 26), "   ", "speed run", "speed-run", "fps!", "jeu🎮", "\u{0301}",
      "ア" + String(repeating: "\u{3099}", count: 4),
    ]
  )
  func rejects(raw: String) {
    #expect(ChannelTag.normalized(raw) == nil)
  }

  @Test("un caractère porte au plus trois marques, comme l'API")
  func acceptsThreeMarks() {
    let tag = "ア" + String(repeating: "\u{3099}", count: 3)

    #expect(ChannelTag.normalized(tag) == tag.precomposedStringWithCanonicalMapping)
  }

  @Test("ajouter un tag le normalise et le place à la fin")
  func addsTag() {
    #expect(makeInfo(tags: ["irl"]).adding(tag: "Café") == makeInfo(tags: ["irl", "cafe"]))
  }

  @Test("un tag déjà présent après normalisation n'est pas ajouté")
  func skipsDuplicate() {
    #expect(makeInfo(tags: ["cafe"]).adding(tag: "Café") == nil)
  }

  @Test("un onzième tag n'est pas ajouté")
  func skipsEleventh() {
    let full = makeInfo(tags: (0 ..< 10).map { "tag\($0)" })

    #expect(full.adding(tag: "encore") == nil)
  }

  @Test("un tag invalide n'est pas ajouté")
  func skipsInvalid() {
    #expect(makeInfo().adding(tag: "speed run") == nil)
  }

  @Test("retirer un tag garde les autres dans l'ordre")
  func removesTag() {
    #expect(makeInfo(tags: ["irl", "cafe", "fps"]).removing(tag: "cafe") == makeInfo(tags: ["irl", "fps"]))
  }

  @Test("cocher un descripteur l'ajoute, le décocher le retire")
  func togglesLabel() {
    let checked = makeInfo().toggling(.gambling)

    #expect(checked.contentLabels == [.gambling])
    #expect(checked.toggling(.gambling).contentLabels == [])
  }

  @Test("un brouillon inchangé n'envoie que son titre et garde la catégorie")
  func unchangedDraft() {
    let current = makeInfo(tags: ["irl"])

    #expect(StreamInfoChange.from(current, to: current) == StreamInfoChange(title: "", category: .keep))
  }

  @Test("seuls les champs que le brouillon change partent vers l'API")
  func changedFields() throws {
    let current = makeInfo(tags: ["irl"])
    var draft = try #require(current.adding(tag: "fps")).toggling(.gambling)
    draft.language = .french
    draft.isBrandedContent = true

    #expect(StreamInfoChange.from(current, to: draft) == StreamInfoChange(
      title: "",
      category: .keep,
      tags: ["irl", "fps"],
      language: .french,
      contentLabels: [.gambling],
      isBrandedContent: true
    ))
  }

  @Test("une langue se nomme dans sa propre langue")
  func nativeName() {
    #expect(LiveLanguage.english.nativeName == "English")
    #expect(LiveLanguage.french.nativeName == "Français")
  }
}
