import Domain
import Testing

@Suite("ViewerCount")
struct ViewerCountTests {
  @Test("accepte zéro et les entiers positifs", arguments: [0, 1, 42, Int.max])
  func accepted(value: Int) throws {
    #expect(try ViewerCount(value).value == value)
  }

  @Test("refuse un compte négatif", arguments: [-1, Int.min])
  func negative(value: Int) {
    #expect(throws: ViewerCountError.negative) {
      try ViewerCount(value)
    }
  }
}
