import CryptoKit
import Foundation
import Security

public struct PKCE: Equatable, Sendable {
  public typealias RandomBytes = @Sendable (Int) -> [UInt8]

  public static let method = "S256"

  public static let systemRandomBytes: RandomBytes = { count in
    var bytes = [UInt8](repeating: 0, count: count)
    let status = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
    precondition(status == errSecSuccess, "SecRandomCopyBytes a échoué : \(status)")
    return bytes
  }

  private static let verifierByteCount = 32

  public let verifier: String
  public let challenge: String

  public init(randomBytes: RandomBytes) {
    verifier = Base64URL.encode(randomBytes(Self.verifierByteCount))
    challenge = Base64URL.encode(Array(SHA256.hash(data: Data(verifier.utf8))))
  }
}

enum Base64URL {
  static func encode(_ bytes: [UInt8]) -> String {
    Data(bytes).base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}
