import DesignSystem
import Foundation
import Testing

private let thumbnail = URL(string: "https://cdn.example/lives/jean_dupont.jpg")

@Suite("Vignette d'un live au rafraîchissement")
struct LivePreviewFrameTests {
  @Test("une première vignette reçue s'affiche")
  func firstPicture() {
    let frame = LivePreviewFrame<String>().receiving("vignette 1", for: thumbnail)

    #expect(frame.picture == "vignette 1")
  }

  @Test("pendant le rechargement, l'ancienne vignette reste ; la nouvelle la remplace à son arrivée")
  func keepsPictureUntilNextArrives() {
    let shown = LivePreviewFrame<String>().receiving("vignette 1", for: thumbnail)

    let refreshed = shown.receiving("vignette 2", for: thumbnail)

    #expect(shown.picture == "vignette 1")
    #expect(refreshed.picture == "vignette 2")
  }

  @Test("une vignette en échec (404, 503, réseau) garde l'image affichée, ou l'aperçu gris")
  func failureKeepsCurrent() {
    let shown = LivePreviewFrame<String>().receiving("vignette 1", for: thumbnail)

    #expect(shown.receiving(nil, for: thumbnail).picture == "vignette 1")
    #expect(LivePreviewFrame<String>().receiving(nil, for: thumbnail).picture == nil)
  }

  @Test("un live sans vignette revient à l'aperçu gris")
  func noThumbnail() {
    let shown = LivePreviewFrame<String>().receiving("vignette 1", for: thumbnail)

    #expect(shown.receiving(nil, for: nil).picture == nil)
  }
}

@Suite("Téléchargement d'une vignette de live")
struct LivePreviewRequestTests {
  @Test("chaque génération redemande la vignette au serveur, sans la copie du cache local")
  func bypassesLocalCache() throws {
    let request = try #require(LivePreview(url: thumbnail, generation: 2).request)

    #expect(request.url == thumbnail)
    #expect(request.cachePolicy == .reloadIgnoringLocalCacheData)
  }

  @Test("sans vignette, rien n'est demandé")
  func noThumbnail() {
    #expect(LivePreview(url: nil, generation: 0).request == nil)
  }
}
