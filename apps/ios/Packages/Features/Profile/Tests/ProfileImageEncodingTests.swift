import Domain
import Foundation
import ImageIO
import Profile
import Testing
import UIKit

private func png(width: Int, height: Int) throws -> Data {
  let format = UIGraphicsImageRendererFormat()
  format.scale = 1
  let size = CGSize(width: width, height: height)
  let renderer = UIGraphicsImageRenderer(size: size, format: format)
  return try #require(renderer.image { context in
    UIColor.systemPurple.setFill()
    context.fill(CGRect(origin: .zero, size: size))
  }.pngData())
}

private func pixelSize(of prepared: PreparedImage) throws -> PixelSize {
  guard case let .jpeg(data) = prepared else {
    Issue.record("pas de JPEG : \(prepared)")
    return PixelSize(width: 0, height: 0)
  }
  #expect(Array(data.prefix(3)) == [0xFF, 0xD8, 0xFF])
  let image = try #require(UIImage(data: data)?.cgImage)
  return PixelSize(width: image.width, height: image.height)
}

@Suite("Image choisie dans la photothèque, réduite à la taille de l'API puis convertie en JPEG")
struct ProfileImageEncodingTests {
  @Test("une grande photo est réduite pour couvrir les 512 × 512 de l'avatar, sans dépasser la limite de pixels de l'API")
  func shrinksAvatar() throws {
    let size = try pixelSize(of: ProfileImageEncoding.prepare(png(width: 4000, height: 3000), for: .avatar))

    #expect(size.height == 512)
    #expect((682 ... 683).contains(size.width))
  }

  @Test("une grande bannière est réduite aux 1920 × 768 de l'API")
  func shrinksBanner() throws {
    let size = try pixelSize(of: ProfileImageEncoding.prepare(png(width: 3000, height: 1200), for: .banner))

    #expect(size == PixelSize(width: 1920, height: 768))
  }

  @Test("une image entre le minimum et la sortie garde sa taille")
  func keepsSmallEnough() throws {
    let size = try pixelSize(of: ProfileImageEncoding.prepare(png(width: 300, height: 300), for: .avatar))

    #expect(size == PixelSize(width: 300, height: 300))
  }

  @Test(
    "une image sous le minimum de l'API est refusée sur l'appareil",
    arguments: [(ImagePurpose.avatar, 255, 400), (.banner, 1179, 2556), (.banner, 1600, 479)]
  )
  func tooSmall(purpose: ImagePurpose, width: Int, height: Int) throws {
    #expect(try ProfileImageEncoding.prepare(png(width: width, height: height), for: purpose) == .tooSmall)
  }

  @Test("des octets qui ne sont pas une image ne donnent rien")
  func rejectsNonImage() {
    #expect(ProfileImageEncoding.prepare(Data("pas une image".utf8), for: .avatar) == .unreadable)
  }
}
