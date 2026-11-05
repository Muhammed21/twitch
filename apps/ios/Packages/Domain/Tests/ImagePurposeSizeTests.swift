import Domain
import Testing

@Suite("Tailles d'une image de profil, reprises de apps/api/src/platform/images/image-purposes.ts")
struct ImagePurposeSizeTests {
  @Test(
    "taille minimale acceptée et taille de sortie de l'API",
    arguments: [
      (ImagePurpose.avatar, PixelSize(width: 256, height: 256), PixelSize(width: 512, height: 512)),
      (ImagePurpose.banner, PixelSize(width: 1200, height: 480), PixelSize(width: 1920, height: 768)),
    ]
  )
  func sizes(purpose: ImagePurpose, minimum: PixelSize, output: PixelSize) {
    #expect(purpose.minimumSize == minimum)
    #expect(purpose.outputSize == output)
  }
}
