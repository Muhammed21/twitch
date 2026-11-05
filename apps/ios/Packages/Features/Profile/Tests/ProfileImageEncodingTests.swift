import Foundation
import Profile
import Testing
import UIKit

private func pngPixel() throws -> Data {
  let renderer = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4))
  return try #require(renderer.image { context in
    UIColor.systemPurple.setFill()
    context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
  }.pngData())
}

@Suite("Image choisie dans la photothèque, convertie en JPEG avant l'envoi")
struct ProfileImageEncodingTests {
  @Test("une image PNG (ou HEIC) devient un JPEG")
  func convertsToJPEG() throws {
    let jpeg = try #require(ProfileImageEncoding.jpeg(from: pngPixel()))

    #expect(Array(jpeg.prefix(3)) == [0xFF, 0xD8, 0xFF])
  }

  @Test("des octets qui ne sont pas une image ne donnent rien")
  func rejectsNonImage() {
    #expect(ProfileImageEncoding.jpeg(from: Data("pas une image".utf8)) == nil)
  }
}
