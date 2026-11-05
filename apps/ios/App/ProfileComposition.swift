import Foundation
import Networking
import Profile
import UIKit
import UniformTypeIdentifiers

extension Composition {
  static func profileEdit(
    apiBaseURL: URL,
    transport: ClientVersionTransport,
    tokens: OAuthSession,
    now: @escaping @Sendable () -> Date
  ) -> ProfileEditStore {
    ProfileEditStore(editor: AccountClient(apiBaseURL: apiBaseURL, transport: transport, tokens: tokens, now: now))
  }

  static func profileImages(
    apiBaseURL: URL,
    transport: ClientVersionTransport,
    tokens: OAuthSession,
    now: @escaping @Sendable () -> Date
  ) -> ProfileImageStore {
    ProfileImageStore(
      uploads: ImageUploadClient(
        apiBaseURL: apiBaseURL,
        transport: transport,
        storage: URLSessionHTTPTransport(),
        tokens: tokens,
        now: now
      ),
      images: ProfileImagesClient(apiBaseURL: apiBaseURL, transport: transport, tokens: tokens, now: now)
    )
  }

  static func myChannel(
    apiBaseURL: URL,
    transport: ClientVersionTransport,
    tokens: OAuthSession,
    channels: ChannelClient
  ) -> MyChannelStore {
    MyChannelStore(
      repository: MyChannelClient(apiBaseURL: apiBaseURL, transport: transport, tokens: tokens, now: { Date.now }),
      channels: channels,
      copy: { key in
        UIPasteboard.general.setItems(
          [[UTType.plainText.identifier: key]],
          options: [.localOnly: true, .expirationDate: Date.now.addingTimeInterval(120)]
        )
      }
    )
  }
}
