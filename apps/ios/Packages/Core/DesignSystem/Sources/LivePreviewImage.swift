import SwiftUI
import UIKit

public struct LivePreviewFrame<Picture: Equatable>: Equatable {
  public let picture: Picture?

  public init() {
    picture = nil
  }

  private init(picture: Picture?) {
    self.picture = picture
  }

  public func receiving(_ loaded: Picture?, for url: URL?) -> LivePreviewFrame {
    guard url != nil else { return LivePreviewFrame() }
    return LivePreviewFrame(picture: loaded ?? picture)
  }
}

struct LivePreviewImage: View {
  let preview: LivePreview
  @State private var frame = LivePreviewFrame<UIImage>()

  var body: some View {
    Group {
      if let picture = frame.picture {
        Image(uiImage: picture).resizable().scaledToFill()
      } else {
        LiveCardStyle.placeholder.color
      }
    }
    .task(id: preview) {
      let loaded = await Self.load(preview.request)
      guard !Task.isCancelled else { return }
      frame = frame.receiving(loaded, for: preview.url)
    }
  }

  private static func load(_ request: URLRequest?) async -> UIImage? {
    guard let request, let (data, response) = try? await URLSession.shared.data(for: request),
          let status = (response as? HTTPURLResponse)?.statusCode, (200 ..< 300).contains(status)
    else { return nil }
    return UIImage(data: data)
  }
}
