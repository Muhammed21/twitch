import Channel
import Chat
import Domain
import Onboarding
import Player
import Preferences
import SwiftUI

struct ChannelScreen: View {
  let slug: ChannelSlug

  @Environment(ChannelPlayback.self) private var channelPlayback
  @Environment(LiveStatusChannel.self) private var liveStatus
  @Environment(ChannelPresence.self) private var presence
  @Environment(ChatSession.self) private var chat
  @Environment(PreferencesStore.self) private var preferences
  @Environment(\.scenePhase) private var scenePhase

  private var watching: ChannelPresence.Watching {
    ChannelPresence.Watching(slug: slug, status: liveStatus.status, scenePhase: scenePhase)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      PlayerSurface()
      ChannelHeader()
      ChatList()
      ChatComposer()
    }
    .environment(\.chatDisplay, ChatDisplay(preferences.current))
    .navigationTitle(slug.rawValue)
    .navigationBarTitleDisplayMode(.inline)
    .task(id: slug) { await channelPlayback.open(slug) }
    .task(id: slug) { await liveStatus.run(slug) }
    .task(id: slug) { await chat.run(slug) }
    .task(id: watching) { await presence.run(watching) }
  }
}
