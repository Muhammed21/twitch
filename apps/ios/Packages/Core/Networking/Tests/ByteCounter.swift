import os

struct ByteCounter: Sendable {
  private let counter = OSAllocatedUnfairLock(initialState: UInt8(0))

  var next: @Sendable (Int) -> [UInt8] {
    { [counter] count in
      let value = counter.withLock { value in
        value &+= 1
        return value
      }
      return Array(repeating: value, count: count)
    }
  }
}
