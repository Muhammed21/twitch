import AVFoundation
@testable import DesignSystem
import Testing

@Suite("Sons du parcours générés par packages/sounds, embarqués dans DesignSystem")
struct SoundResourceTests {
  @Test("chaque son est une ressource WAV lisible, mono, à 44,1 kHz", arguments: ["tap", "validation", "success", "transition"])
  func bundled(name: String) throws {
    let url = try #require(Bundle.module.url(forResource: name, withExtension: "wav", subdirectory: "Sounds"))
    let file = try AVAudioFile(forReading: url)

    #expect(file.fileFormat.sampleRate == 44100)
    #expect(file.fileFormat.channelCount == 1)
    #expect(file.length > 0)
  }
}
