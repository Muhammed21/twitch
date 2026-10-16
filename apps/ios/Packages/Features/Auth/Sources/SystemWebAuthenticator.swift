import AuthenticationServices
import UIKit

@MainActor
public final class SystemWebAuthenticator: NSObject, WebAuthenticator, ASWebAuthenticationPresentationContextProviding {
  private var current: ASWebAuthenticationSession?

  override public init() {
    super.init()
  }

  public func authenticate(at url: URL, callbackScheme: String) async throws -> URL {
    try await withCheckedThrowingContinuation { continuation in
      let session = makeSession(url: url, callbackScheme: callbackScheme) { continuation.resume(with: $0) }
      current = session
      if !session.start() {
        continuation.resume(throwing: WebAuthenticationError.unavailable)
      }
    }
  }

  public func makeSession(
    url: URL,
    callbackScheme: String,
    completion: @escaping @Sendable (Result<URL, any Error>) -> Void
  ) -> ASWebAuthenticationSession {
    let session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { callback, error in
      completion(Self.outcome(callback: callback, error: error))
    }
    session.prefersEphemeralWebBrowserSession = true
    session.presentationContextProvider = self
    return session
  }

  public nonisolated static func outcome(callback: URL?, error: (any Error)?) -> Result<URL, any Error> {
    if let callback { return .success(callback) }
    if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
      return .failure(WebAuthenticationError.canceled)
    }
    return .failure(error ?? WebAuthenticationError.unavailable)
  }

  public func presentationAnchor(for _: ASWebAuthenticationSession) -> ASPresentationAnchor {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first { $0.isKeyWindow } ?? ASPresentationAnchor()
  }
}
