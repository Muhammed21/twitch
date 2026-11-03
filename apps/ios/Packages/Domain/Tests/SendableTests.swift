import Domain
import Testing

private func requireSendable(_: (some Sendable).Type) {}

@Suite("Types Sendable (vérifiés par le compilateur)")
struct SendableTests {
  @Test("modèles, value objects et protocoles du domaine traversent les acteurs")
  func domainTypes() {
    requireSendable(ChannelID.self)
    requireSendable(ChannelSlug.self)
    requireSendable(ChannelSlugError.self)
    requireSendable(Channel.self)
    requireSendable(StreamSession.self)
    requireSendable(LiveChannel.self)
    requireSendable(LiveCursor.self)
    requireSendable(LivePage.self)
    requireSendable(ViewerCount.self)
    requireSendable(ViewerCountError.self)
    requireSendable(ChatAuthor.self)
    requireSendable(ChatMessage.self)
    requireSendable(ChatRejectionReason.self)
    requireSendable(ChatSendOutcome.self)
    requireSendable((any ChannelRepository).self)
    requireSendable((any LiveDirectory).self)
    requireSendable((any PlaybackSource).self)
    requireSendable(LiveStatus.self)
    requireSendable(LiveStatusUnavailable.self)
    requireSendable((any LiveStatusSource).self)
    requireSendable((any ChatConnection).self)
    requireSendable(AppVersion.self)
    requireSendable(AppVersionError.self)
    requireSendable(FeatureFlags.self)
    requireSendable(AppBootstrap.self)
    requireSendable(ServiceProblem.self)
    requireSendable((any BootstrapSource).self)
  }
}
