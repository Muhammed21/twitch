import DesignSystem
import Domain
import Observation

@MainActor
@Observable
public final class ChatColorStore {
  public private(set) var selected: ChatNameColor?
  public private(set) var isSaving = false
  public private(set) var hasFailed = false

  private let updater: any ChatColorUpdating

  public init(updater: any ChatColorUpdating, selected: ChatNameColor?) {
    self.updater = updater
    self.selected = selected
  }

  public func choose(_ color: ChatNameColor?) async {
    guard !isSaving, color != selected else { return }
    isSaving = true
    hasFailed = false
    defer { isSaving = false }
    do {
      try await updater.setChatColor(color?.hex)
      selected = color
    } catch {
      hasFailed = true
    }
  }
}
