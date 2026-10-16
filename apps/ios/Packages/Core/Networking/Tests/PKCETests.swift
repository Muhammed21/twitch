import Foundation
import Networking
import os
import Testing

private let rfc7636Bytes: [UInt8] = [
  116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186,
  22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121,
]

private let unreserved = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

@Suite("PKCE S256")
struct PKCETests {
  @Test("reproduit le vecteur de la RFC 7636, annexe B")
  func rfc7636Vector() {
    let pkce = PKCE(randomBytes: { _ in rfc7636Bytes })

    #expect(pkce.verifier == "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
    #expect(pkce.challenge == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
  }

  @Test("tire 32 octets d'aléa, soit un code_verifier de 43 caractères non réservés")
  func verifierShape() {
    let requested = OSAllocatedUnfairLock(initialState: [Int]())
    let pkce = PKCE(randomBytes: { count in
      requested.withLock { $0.append(count) }
      return Array(repeating: 255, count: count)
    })

    #expect(requested.withLock { $0 } == [32])
    #expect(pkce.verifier.count == 43)
    #expect(pkce.verifier.allSatisfy(unreserved.contains))
  }

  @Test("annonce la méthode S256")
  func method() {
    #expect(PKCE.method == "S256")
  }

  @Test("l'aléa système rend un code_verifier différent à chaque appel")
  func systemRandomness() {
    #expect(PKCE(randomBytes: PKCE.systemRandomBytes) != PKCE(randomBytes: PKCE.systemRandomBytes))
  }
}
